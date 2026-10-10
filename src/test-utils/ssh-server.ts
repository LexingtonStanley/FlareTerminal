// An SSH server for tests: the ssh2 package's server (an independent implementation of
// the protocol) on a random localhost port, with a shell that echoes input back as
// `echo:<input>`. Use in Jest files marked `@jest-environment node`, and call
// stopTestSshServers() in afterEach.
import { spawn } from 'node:child_process';
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
  /** Commands clients ran (exec), in order. */
  commands: string[];
  /** Times a client asked for agent forwarding (auth-agent-req@openssh.com). */
  agentRequests: () => number;
  /** The server side of the latest shell. */
  shell: () => ServerChannel;
  /**
   * Opens an agent channel to the latest client, as sshd does when a program connects to
   * $SSH_AUTH_SOCK. Rejects when the client refuses it.
   */
  openAgentChannel: () => Promise<ServerChannel>;
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
  commands = true,
  agent = false,
  home,
  authenticate = (ctx) =>
    ctx.method === 'password' && ctx.password === 'correct-horse'
      ? ctx.accept()
      : ctx.reject(['password']),
}: {
  hostKey?: HostKeyType;
  algorithms?: ConstructorParameters<typeof Server>[0]['algorithms'];
  /** Whether it forwards ports (direct-tcpip), connecting from this machine like sshd. */
  forwarding?: boolean;
  /** Whether it runs commands (exec) with this machine's /bin/sh, like sshd. */
  commands?: boolean;
  /** Whether it agrees to forward the agent (AllowAgentForwarding). */
  agent?: boolean;
  /** The commands' $HOME (a test can't change this process's: Jest gives it a copy). */
  home?: string;
  authenticate?: (ctx: AuthContext) => void;
} = {}): Promise<TestServer> {
  const keys = generateHostKey(hostKey);

  let latestShell: ServerChannel | null = null;
  let latestConnection: ServerInternals | null = null;
  const state = {
    ptys: [] as TestServer['ptys'],
    resizes: [] as TestServer['resizes'],
    received: [] as string[],
    tunnels: [] as TestServer['tunnels'],
    commands: [] as string[],
  };
  let agentRequests = 0;

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
            stream.pipe(target);
            // Like OpenSSH: EOF when the target closes, then the client closes the channel.
            target.on('data', (data: Buffer) => stream.write(data));
            target.on('end', () => stream.eof());
            stream.on('close', () => target.destroy());
          });
        });
      }
      connection.on('session', (accept) => {
        const session = accept();
        if (agent) {
          session.on('auth-agent', (acceptAgent) => {
            agentRequests++;
            acceptAgent?.();
          });
        }
        session.on('pty', (acceptPty, _reject, info) => {
          state.ptys.push({ term: info.term, cols: info.cols, rows: info.rows });
          acceptPty?.();
        });
        session.on('window-change', (acceptResize, _reject, info) => {
          state.resizes.push({ cols: info.cols, rows: info.rows });
          acceptResize?.();
        });
        session.on('exec', (acceptExec, rejectExec, info) => {
          state.commands.push(info.command);
          if (!commands) return rejectExec?.();
          const stream = acceptExec();
          // Its own process group, so closing the channel stops everything it started.
          const child = spawn('/bin/sh', ['-c', info.command], {
            detached: true,
            env: home ? { ...process.env, HOME: home } : process.env,
          });
          stream.pipe(child.stdin).on('error', () => {});
          child.stdout.pipe(stream, { end: false });
          child.stderr.pipe(stream.stderr, { end: false });
          child.on('close', (code) => {
            stream.exit(code ?? 1);
            stream.end();
          });
          stream.on('close', () => {
            try {
              process.kill(-child.pid!, 'SIGHUP');
            } catch {
              // Already ended.
            }
          });
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
    agentRequests: () => agentRequests,
    shell: () => {
      if (!latestShell) throw new Error('No shell yet');
      return latestShell;
    },
    openAgentChannel: () => openAgentChannel(latestConnection!),
    rekey: () =>
      new Promise((resolve, reject) =>
        latestConnection!.rekey((error) => (error ? reject(error) : resolve()))
      ),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  servers.push(testServer);
  return testServer;
}

/** The parts of ssh2's server connection these tests reach into. */
type ServerInternals = {
  rekey(cb: (err?: Error) => void): void;
  _chanMgr: { add(open: (err: Error | undefined, stream: ServerChannel) => void): number };
  _protocol: { openssh_authAgent(chan: number, window: number, packetSize: number): void };
};

/**
 * ssh2's server can't open agent channels itself (it only answers the request), so this
 * opens one the way it opens its other server-side channels (openChannel in its server.js).
 */
function openAgentChannel(connection: ServerInternals): Promise<ServerChannel> {
  return new Promise((resolve, reject) => {
    const open = Object.assign(
      (err: Error | undefined, stream: ServerChannel) => (err ? reject(err) : resolve(stream)),
      { type: 'auth-agent@openssh.com' }
    );
    const channel = connection._chanMgr.add(open);
    connection._protocol.openssh_authAgent(channel, 2 * 1024 * 1024, 32 * 1024);
  });
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
