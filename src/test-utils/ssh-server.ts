// An SSH server for tests: the ssh2 package's server (an independent implementation of
// the protocol) on a random localhost port, with a shell that echoes input back as
// `echo:<input>`. Use in Jest files marked `@jest-environment node`, and call
// stopTestSshServers() in afterEach.
import { once } from 'node:events';
import { createConnection, type AddressInfo, type Socket } from 'node:net';
import { Server, utils, type AuthContext, type ServerChannel } from 'ssh2';

import type { OpenSocket } from '@/features/ssh/socket';

export type HostKeyType = 'ed25519' | 'ecdsa' | 'rsa';

export type TestServer = {
  port: number;
  publicKey: string;
  ptys: { term: string; cols: number; rows: number }[];
  resizes: { cols: number; rows: number }[];
  received: string[];
  /** Where clients asked to be forwarded (direct-tcpip), in order. */
  tunnels: { host: string; port: number }[];
  /** The server side of the latest shell. */
  shell: () => ServerChannel;
  rekey: () => Promise<void>;
  close: () => Promise<void>;
};

/**
 * About 1 in 125 Ed25519 keys that ssh2 generates can't be read back by ssh2's own parser
 * ("Malformed OpenSSH private key"), which failed a test run now and then. Generate until
 * it can.
 */
function generateHostKey(type: HostKeyType) {
  for (;;) {
    const keys =
      type === 'rsa'
        ? utils.generateKeyPairSync('rsa', { bits: 2048 })
        : type === 'ecdsa'
          ? utils.generateKeyPairSync('ecdsa', { bits: 256 })
          : utils.generateKeyPairSync('ed25519');
    if (!(utils.parseKey(keys.private) instanceof Error)) return keys;
  }
}

export async function startTestSshServer({
  hostKey = 'ed25519',
  algorithms,
  forwarding = true,
  authenticate = (ctx) =>
    ctx.method === 'password' && ctx.password === 'correct-horse'
      ? ctx.accept()
      : ctx.reject(['password']),
}: {
  hostKey?: HostKeyType;
  algorithms?: ConstructorParameters<typeof Server>[0]['algorithms'];
  /** Whether it forwards ports (direct-tcpip), connecting from this machine like sshd. */
  forwarding?: boolean;
  authenticate?: (ctx: AuthContext) => void;
} = {}): Promise<TestServer> {
  const keys = generateHostKey(hostKey);

  let latestShell: ServerChannel | null = null;
  let latestConnection: { rekey(cb: (err?: Error) => void): void } | null = null;
  const state = {
    ptys: [] as TestServer['ptys'],
    resizes: [] as TestServer['resizes'],
    received: [] as string[],
    tunnels: [] as TestServer['tunnels'],
  };

  const server = new Server({ hostKeys: [keys.private], algorithms }, (connection) => {
    latestConnection = connection as unknown as typeof latestConnection;
    connection.on('authentication', authenticate);
    connection.on('ready', () => {
      if (forwarding) {
        connection.on('tcpip', (accept, reject, info) => {
          state.tunnels.push({ host: info.destIP, port: info.destPort });
          const host = info.destIP === 'localhost' ? '127.0.0.1' : info.destIP;
          const target = createConnection({ host, port: info.destPort });
          target.once('error', () => reject());
          target.once('connect', () => {
            const stream = accept();
            stream.on('error', () => target.destroy());
            target.on('error', () => stream.close());
            stream.pipe(target).pipe(stream);
          });
        });
      }
      connection.on('session', (accept) => {
        const session = accept();
        session.on('pty', (acceptPty, _reject, info) => {
          state.ptys.push({ term: info.term, cols: info.cols, rows: info.rows });
          acceptPty?.();
        });
        session.on('window-change', (acceptResize, _reject, info) => {
          state.resizes.push({ cols: info.cols, rows: info.rows });
          acceptResize?.();
        });
        session.on('shell', (acceptShell) => {
          const shell = acceptShell();
          latestShell = shell;
          shell.write('$ ');
          shell.on('data', (data: Buffer) => {
            state.received.push(data.toString('utf8'));
            shell.write(`echo:${data.toString('utf8')}`);
          });
        });
      });
    });
    connection.on('error', () => {});
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const testServer: TestServer = {
    port: (server.address() as AddressInfo).port,
    publicKey: keys.public,
    ...state,
    shell: () => {
      if (!latestShell) throw new Error('No shell yet');
      return latestShell;
    },
    rekey: () =>
      new Promise((resolve, reject) =>
        latestConnection!.rekey((error) => (error ? reject(error) : resolve()))
      ),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  servers.push(testServer);
  return testServer;
}

const servers: TestServer[] = [];
/** Client sockets opened by tests; destroyed on stop so servers can close. */
export const testSockets: Socket[] = [];

export async function stopTestSshServers() {
  testSockets.splice(0).forEach((socket) => socket.destroy());
  await Promise.all(servers.splice(0).map((server) => server.close()));
}

/** The app's socket interface over node:net, for running transports in Jest. */
export const openNodeSocket: OpenSocket = async (host, port, events) => {
  const socket = createConnection({ host, port });
  testSockets.push(socket);
  await once(socket, 'connect');
  socket.on('data', (data: Buffer) => events.onData(new Uint8Array(data)));
  socket.on('close', () => events.onClose());
  return { write: (bytes) => socket.write(bytes), close: () => socket.destroy() };
};

export async function waitFor(check: () => boolean, timeout = 5000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
