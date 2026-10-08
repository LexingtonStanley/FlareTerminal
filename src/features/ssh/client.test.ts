/**
 * @jest-environment node
 */
// Interoperability tests: our client against the ssh2 package's server (an independent
// implementation) over a real TCP socket.
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { utils, type CipherAlgorithm } from 'ssh2';

import {
  startTestSshServer as startServer,
  stopTestSshServers,
  testSockets as sockets,
  waitFor,
  type HostKeyType,
} from '@/test-utils/ssh-server';

import { fromUtf8, utf8 } from './bytes';
import { SshChannel, SshClient, type SshClientOptions, type SshCloseReason } from './client';
import { fingerprint } from './host-keys';
import { generateUserKey, publicKeyLine } from './user-key';

afterEach(stopTestSshServers);

async function connect(port: number, options: Partial<SshClientOptions> = {}) {
  const socket = createConnection({ host: '127.0.0.1', port });
  sockets.push(socket);
  await once(socket, 'connect');
  let resolveClosed: (reason: SshCloseReason) => void = () => {};
  const closed = new Promise<SshCloseReason>((resolve) => (resolveClosed = resolve));
  const client = new SshClient(
    { write: (bytes) => socket.write(bytes), close: () => socket.destroy() },
    {
      host: '127.0.0.1',
      port,
      username: 'ada',
      verifyHostKey: async () => true,
      prompt: async () => null,
      keepaliveInterval: 0,
      onClose: (reason) => resolveClosed(reason),
      ...options,
    }
  );
  socket.on('data', (data: Buffer) => client.receive(new Uint8Array(data)));
  socket.on('close', () => client.socketClosed());
  return { client, closed };
}

/** Opens a shell and collects its output as text. */
async function shell(client: SshClient, size = { cols: 45, rows: 30 }) {
  const channel = await client.openShell({ term: 'xterm-256color', ...size });
  const output = { text: '', bytes: 0 };
  channel.onData = (data) => {
    output.text += fromUtf8(data);
    output.bytes += data.length;
  };
  return { channel, output };
}

describe('SshChannel', () => {
  // Go's x/crypto/ssh server (Tailscale SSH) sends output before answering the shell
  // request, so data can arrive before the caller has attached a handler.
  it('keeps output and the close that arrive before handlers are attached', () => {
    const channel = new SshChannel({} as SshClient, 0);
    channel.receiveData(utf8('early '));
    channel.receiveData(utf8('output'));
    channel.receiveClose();

    const received: string[] = [];
    channel.onData = (data) => received.push(fromUtf8(data));
    const onClose = jest.fn();
    channel.onClose = onClose;

    expect(received.join('')).toBe('early output');
    expect(onClose).toHaveBeenCalledWith(channel);
  });
});

describe('SshClient against the ssh2 server', () => {
  it.each<CipherAlgorithm>([
    'chacha20-poly1305@openssh.com',
    'aes256-gcm@openssh.com',
    'aes128-gcm@openssh.com',
  ])('runs a shell over %s', async (cipher) => {
    const server = await startServer({ algorithms: { cipher: [cipher] } });
    const { client } = await connect(server.port, { password: 'correct-horse' });

    await client.handshake();
    await client.authenticate();
    const { channel, output } = await shell(client);
    channel.write(utf8('ls ✓\n'));

    await waitFor(() => output.text.includes('echo:ls ✓'));
    expect(output.text.startsWith('$ ')).toBe(true);
    expect(server.ptys).toEqual([{ term: 'xterm-256color', cols: 45, rows: 30 }]);
  });

  it.each<HostKeyType>(['ed25519', 'ecdsa', 'rsa'])(
    'verifies a %s host key and reports its fingerprint',
    async (hostKey) => {
      const server = await startServer({ hostKey });
      const verifyHostKey = jest.fn(async () => true);
      const { client } = await connect(server.port, {
        password: 'correct-horse',
        verifyHostKey,
      });

      await client.handshake();

      const parsed = utils.parseKey(server.publicKey);
      if (parsed instanceof Error) throw parsed;
      const blob = new Uint8Array(parsed.getPublicSSH() as Buffer);
      expect(verifyHostKey).toHaveBeenCalledWith(
        expect.objectContaining({ fingerprint: fingerprint(blob) })
      );
      expect(fingerprint(blob)).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    }
  );

  it('closes without signing in when the host key is refused', async () => {
    const server = await startServer();
    const { client, closed } = await connect(server.port, { verifyHostKey: async () => false });

    await expect(client.handshake()).rejects.toThrow('Host key not accepted');
    expect(await closed).toEqual({ message: 'Host key not accepted', clean: true });
  });

  it('asks again after a wrong password, then gives up after three tries', async () => {
    const server = await startServer();
    const prompt = jest
      .fn()
      .mockResolvedValueOnce(['wrong'])
      .mockResolvedValueOnce(['correct-horse']);
    const { client } = await connect(server.port, { password: 'stale', prompt });

    await client.handshake();
    await client.authenticate();

    expect(prompt).toHaveBeenCalledTimes(2);
    expect(prompt.mock.calls[0][0].prompts).toEqual([
      { prompt: "ada@127.0.0.1's password: ", echo: false },
    ]);

    const second = await connect(server.port, { prompt: async () => ['nope'] });
    await second.client.handshake();
    await expect(second.client.authenticate()).rejects.toThrow('Permission denied (password).');
  });

  it('stops when the person cancels the password prompt', async () => {
    const server = await startServer();
    const { client } = await connect(server.port, { prompt: async () => null });

    await client.handshake();
    await expect(client.authenticate()).rejects.toThrow('Sign-in cancelled');
  });

  it('answers keyboard-interactive with the saved password', async () => {
    const server = await startServer({
      authenticate: (ctx) => {
        if (ctx.method !== 'keyboard-interactive') return ctx.reject(['keyboard-interactive']);
        ctx.prompt([{ prompt: 'Password: ', echo: false }], (answers) =>
          answers[0] === 'correct-horse' ? ctx.accept() : ctx.reject()
        );
      },
    });
    const prompt = jest.fn(async () => null);
    const { client } = await connect(server.port, { password: 'correct-horse', prompt });

    await client.handshake();
    await client.authenticate();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('signs in with the app key', async () => {
    const userKey = generateUserKey();
    const expected = utils.parseKey(publicKeyLine(userKey));
    if (expected instanceof Error) throw expected;
    const server = await startServer({
      authenticate: (ctx) => {
        if (ctx.method !== 'publickey') return ctx.reject(['publickey']);
        const sameKey = Buffer.compare(ctx.key.data, expected.getPublicSSH() as Buffer) === 0;
        const valid =
          ctx.signature && ctx.blob && expected.verify(ctx.blob, ctx.signature, ctx.hashAlgo);
        return sameKey && valid ? ctx.accept() : ctx.reject();
      },
    });
    const { client } = await connect(server.port, { userKey });

    await client.handshake();
    await client.authenticate();
  });

  it('signs in without credentials when the host allows it (Tailscale SSH does)', async () => {
    const server = await startServer({
      authenticate: (ctx) => (ctx.method === 'none' ? ctx.accept() : ctx.reject()),
    });
    const prompt = jest.fn(async () => null);
    const { client } = await connect(server.port, { prompt });

    await client.handshake();
    await client.authenticate();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('resizes the remote terminal', async () => {
    const server = await startServer();
    const { client } = await connect(server.port, { password: 'correct-horse' });
    await client.handshake();
    await client.authenticate();
    const { channel } = await shell(client);

    channel.resize(60, 20);

    await waitFor(() => server.resizes.length > 0);
    expect(server.resizes).toEqual([{ cols: 60, rows: 20 }]);
  });

  it('moves megabytes both ways within the flow-control windows', async () => {
    const server = await startServer();
    const { client } = await connect(server.port, { password: 'correct-horse' });
    await client.handshake();
    await client.authenticate();
    const { channel, output } = await shell(client);

    // Bigger than both sides' windows, so window adjusts must flow.
    const big = 'x'.repeat(3 * 1024 * 1024);
    server.shell().write(big);
    await waitFor(() => output.bytes >= big.length + 2, 20000);

    const upload = 'y'.repeat(600 * 1024);
    channel.write(utf8(upload));
    await waitFor(() => server.received.join('').length >= upload.length, 20000);
    expect(server.received.join('')).toBe(upload);
  }, 30000);

  it('keeps working through a key re-exchange the server starts', async () => {
    const server = await startServer();
    const { client } = await connect(server.port, { password: 'correct-horse' });
    await client.handshake();
    await client.authenticate();
    const { channel, output } = await shell(client);

    await server.rekey();
    channel.write(utf8('after rekey\n'));

    await waitFor(() => output.text.includes('echo:after rekey'));
  });

  it('reports the exit status when the shell ends', async () => {
    const server = await startServer();
    const { client } = await connect(server.port, { password: 'correct-horse' });
    await client.handshake();
    await client.authenticate();
    const { channel } = await shell(client);
    const ended = new Promise<number | null>((resolve) => {
      channel.onClose = (closedChannel) => resolve(closedChannel.exitStatus);
    });

    server.shell().exit(3);
    server.shell().end();

    expect(await ended).toBe(3);
  });

  it('reports when the network drops', async () => {
    const server = await startServer();
    const { client, closed } = await connect(server.port, { password: 'correct-horse' });
    await client.handshake();
    await client.authenticate();

    // The socket dies under the client, as when a phone changes networks.
    sockets.at(-1)!.destroy();

    expect(await closed).toEqual({ message: 'Connection lost', clean: false });
  });
});
