/**
 * @jest-environment node
 */
import type { KnownHost, KnownHosts } from '@/features/ssh/known-hosts';
import {
  openNodeSocket,
  startTestSshServer,
  stopTestSshServers,
  testSockets,
  waitFor,
} from '@/test-utils/ssh-server';

import { SshTransport, type SshJump } from './ssh-transport';
import type { InputMode, SessionStatus } from './transport';

// known-hosts.ts imports the SQLite-backed storage; these tests pass their own store.
jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

afterEach(stopTestSshServers);

function memoryKnownHosts(initial: Record<string, KnownHost> = {}): KnownHosts & {
  entries: Record<string, KnownHost>;
} {
  const entries = { ...initial };
  return {
    entries,
    get: (host, port) => entries[`${host}:${port}`] ?? null,
    trust: (host, port, entry) => {
      entries[`${host}:${port}`] = entry;
    },
    forget: (host, port) => {
      delete entries[`${host}:${port}`];
    },
  };
}

/** Whether `target` can be reached from `root` through properties (closures aside). */
function reaches(root: unknown, target: unknown, seen = new Set<unknown>()): boolean {
  if (root === target) return true;
  if (root === null || typeof root !== 'object' || ArrayBuffer.isView(root) || seen.has(root)) {
    return false;
  }
  seen.add(root);
  const values =
    root instanceof Map
      ? [...root.keys(), ...root.values()]
      : root instanceof Set
        ? [...root]
        : Object.values(root);
  return values.some((value) => reaches(value, target, seen));
}

function open(
  port: number,
  {
    password = null as string | null,
    knownHosts = memoryKnownHosts(),
    jumps = [] as SshJump[],
    opened = [] as number[],
  } = {}
) {
  const screen = { text: '', statuses: [] as SessionStatus[], modes: [] as InputMode[] };
  const transport = new SshTransport(
    {
      host: '127.0.0.1',
      port,
      username: 'ada',
      password,
      userKeys: [],
      knownHosts,
      // Records the ports the phone itself connects to.
      openSocket: (host, toPort, events) => {
        opened.push(toPort);
        return openNodeSocket(host, toPort, events);
      },
      keepaliveInterval: 0,
      jumps,
    },
    {
      onData: (text) => (screen.text += text),
      onTitle: () => {},
      onStatus: (status) => screen.statuses.push(status),
      onInputMode: (mode) => screen.modes.push(mode),
    }
  );
  transport.connect({ cols: 50, rows: 20 });
  const status = () => screen.statuses.at(-1)?.state;
  return { transport, screen, knownHosts, status };
}

describe('SshTransport', () => {
  it('asks about a new host key and a password inside the terminal, then runs the shell', async () => {
    const server = await startTestSshServer();
    const { transport, screen, knownHosts, status } = open(server.port);

    await waitFor(() => screen.text.includes('(yes/no)? '));
    expect(screen.text).toContain("The authenticity of host '[127.0.0.1]:");
    expect(screen.text).toMatch(/ED25519 key fingerprint is SHA256:[\w+/]{43}\./);
    transport.write('yes\r');

    await waitFor(() => screen.text.includes("ada@127.0.0.1's password: "));
    expect(screen.modes.at(-1)).toBe('secret');
    transport.write('correct-');
    transport.write('horse\r');

    await waitFor(() => status() === 'connected');
    expect(screen.modes.at(-1)).toBe('normal');
    // The password was never echoed.
    expect(screen.text).not.toContain('correct-horse');
    expect(Object.values(knownHosts.entries)).toEqual([
      expect.objectContaining({ type: 'ssh-ed25519' }),
    ]);
    expect(server.ptys).toEqual([{ term: 'xterm-256color', cols: 50, rows: 20 }]);

    transport.write('ls ✓\r');
    await waitFor(() => screen.text.includes('echo:ls ✓'));
    transport.resize({ cols: 40, rows: 15 });
    await waitFor(() => server.resizes.length === 1);
  });

  it('connects straight through for a known host with a saved password', async () => {
    const server = await startTestSshServer();
    const first = open(server.port, { password: 'correct-horse' });
    await waitFor(() => first.screen.text.includes('(yes/no)? '));
    first.transport.write('yes\r');
    await waitFor(() => first.status() === 'connected');

    const second = open(server.port, {
      password: 'correct-horse',
      knownHosts: first.knownHosts,
    });
    await waitFor(() => second.status() === 'connected');
    expect(second.screen.text).not.toContain('authenticity');
  });

  it('keeps no saved password once signed in', async () => {
    const server = await startTestSshServer();
    const first = open(server.port, { password: 'correct-horse' });
    await waitFor(() => first.screen.text.includes('(yes/no)? '));
    first.transport.write('yes\r');
    await waitFor(() => first.status() === 'connected');

    const second = open(server.port, { password: 'correct-horse', knownHosts: first.knownHosts });
    expect(reaches(second.transport, 'correct-horse')).toBe(true);
    await waitFor(() => second.status() === 'connected');

    // A forgotten vault key leaves nothing readable behind in an open session either.
    expect(reaches(first.transport, 'correct-horse')).toBe(false);
    expect(reaches(second.transport, 'correct-horse')).toBe(false);
  });

  it('refuses a host whose key changed', async () => {
    const original = await startTestSshServer();
    const trusting = open(original.port, { password: 'correct-horse' });
    await waitFor(() => trusting.screen.text.includes('(yes/no)? '));
    trusting.transport.write('yes\r');
    await waitFor(() => trusting.status() === 'connected');
    const [entry] = Object.values(trusting.knownHosts.entries);

    // A different server (new key) answering on a port we recorded a key for.
    const impostor = await startTestSshServer();
    const knownHosts = memoryKnownHosts({ [`127.0.0.1:${impostor.port}`]: entry });
    const { screen, status } = open(impostor.port, { password: 'correct-horse', knownHosts });

    await waitFor(() => status() === 'closed');
    expect(screen.text).toContain('HAS CHANGED!');
    expect(screen.statuses.at(-1)).toEqual({
      state: 'closed',
      message: expect.stringContaining('The host key changed'),
    });
  });

  it('gives up when the person presses Ctrl+C at the password prompt', async () => {
    const server = await startTestSshServer();
    const { transport, screen, status } = open(server.port);
    await waitFor(() => screen.text.includes('(yes/no)? '));
    transport.write('yes\r');
    await waitFor(() => screen.text.includes('password: '));

    transport.write('\x03');

    await waitFor(() => status() === 'closed');
    expect(screen.statuses.at(-1)).toEqual({ state: 'closed', message: 'Sign-in cancelled' });
  });

  it('explains when nothing is listening', async () => {
    // Port 1 (tcpmux) is closed on any machine running tests. A port freed by another
    // test could be taken by a parallel Jest worker before the connection attempt.
    const { screen, status } = open(1);

    await waitFor(() => status() === 'closed');
    expect(screen.statuses.at(-1)).toEqual({
      state: 'closed',
      message: expect.stringMatching(/^Couldn't reach 127\.0\.0\.1:1\./),
      retry: true,
    });
  });

  it('marks a dropped connection as worth retrying, and a finished session not', async () => {
    const server = await startTestSshServer();
    const dropped = open(server.port, { password: 'correct-horse' });
    await waitFor(() => dropped.screen.text.includes('(yes/no)? '));
    dropped.transport.write('yes\r');
    await waitFor(() => dropped.status() === 'connected');

    testSockets.at(-1)!.destroy();

    await waitFor(() => dropped.status() === 'closed');
    expect(dropped.screen.statuses.at(-1)).toEqual({
      state: 'closed',
      message: 'Connection lost',
      retry: true,
    });

    const ended = open(server.port, { password: 'correct-horse', knownHosts: dropped.knownHosts });
    await waitFor(() => ended.status() === 'connected');
    server.shell().exit(0);
    server.shell().end();
    await waitFor(() => ended.status() === 'closed');
    expect(ended.screen.statuses.at(-1)).toMatchObject({ message: 'Session ended' });
    expect(ended.screen.statuses.at(-1)).not.toHaveProperty('retry');
  });
});

describe('SshTransport through a jump host', () => {
  const jump = (port: number, changes: Partial<SshJump> = {}): SshJump => ({
    name: 'Bastion',
    host: '127.0.0.1',
    port,
    username: 'ada',
    password: null,
    userKeys: [],
    ...changes,
  });

  /** A host behind the jump host, with its own password. */
  const startInnerServer = (options: Parameters<typeof startTestSshServer>[0] = {}) =>
    startTestSshServer({
      authenticate: (ctx) =>
        ctx.method === 'password' && ctx.password === 'battery-staple'
          ? ctx.accept()
          : ctx.reject(['password']),
      ...options,
    });

  /** Both hosts' keys, trusted. */
  async function trustBoth(bastionPort: number, innerPort: number) {
    const knownHosts = memoryKnownHosts();
    const first = open(innerPort, {
      password: 'battery-staple',
      knownHosts,
      jumps: [jump(bastionPort, { password: 'correct-horse' })],
    });
    await waitFor(() => first.screen.text.includes('(yes/no)? '));
    first.transport.write('yes\r');
    await waitFor(() => first.screen.text.split('(yes/no)? ').length === 3);
    first.transport.write('yes\r');
    await waitFor(() => first.status() === 'connected');
    first.transport.close();
    return knownHosts;
  }

  it('signs in to the jump host, then to the host through it, asking about each in turn', async () => {
    const bastion = await startTestSshServer();
    const inner = await startInnerServer();
    const opened: number[] = [];
    const { transport, screen, knownHosts, status } = open(inner.port, {
      jumps: [jump(bastion.port)],
      opened,
    });

    await waitFor(() => screen.text.includes('(yes/no)? '));
    expect(screen.text).toContain(`The authenticity of host '[127.0.0.1]:${bastion.port}'`);
    transport.write('yes\r');
    await waitFor(() => screen.text.includes("ada@127.0.0.1's password: "));
    transport.write('correct-horse\r');

    await waitFor(() => screen.text.includes(`'[127.0.0.1]:${inner.port}' can't be established`));
    transport.write('yes\r');
    await waitFor(() => screen.text.split("ada@127.0.0.1's password: ").length === 3);
    transport.write('battery-staple\r');

    await waitFor(() => status() === 'connected');
    // The phone only ever connected to the jump host, which forwarded to the host.
    expect(opened).toEqual([bastion.port]);
    expect(bastion.tunnels).toEqual([{ host: '127.0.0.1', port: inner.port }]);
    expect(Object.keys(knownHosts.entries).sort()).toEqual(
      [`127.0.0.1:${bastion.port}`, `127.0.0.1:${inner.port}`].sort()
    );
    expect(inner.ptys).toEqual([{ term: 'xterm-256color', cols: 50, rows: 20 }]);
    expect(bastion.ptys).toEqual([]);

    transport.write('uptime\r');
    await waitFor(() => screen.text.includes('echo:uptime'));
    expect(inner.received).toEqual(['uptime\r']);
  });

  it('goes through several, and keeps none of their saved passwords once signed in', async () => {
    const outer = await startTestSshServer();
    const middle = await startTestSshServer();
    const inner = await startInnerServer();
    const knownHosts = memoryKnownHosts();
    const jumps = [
      jump(outer.port, { name: 'Outer', password: 'correct-horse' }),
      jump(middle.port, { name: 'Middle', password: 'correct-horse' }),
    ];
    const { transport, screen, status } = open(inner.port, {
      password: 'battery-staple',
      knownHosts,
      jumps,
    });
    expect(reaches(transport, 'correct-horse')).toBe(true);

    for (const count of [2, 3, 4]) {
      await waitFor(() => screen.text.split('(yes/no)? ').length === count);
      transport.write('yes\r');
    }

    await waitFor(() => status() === 'connected');
    expect(outer.tunnels).toEqual([{ host: '127.0.0.1', port: middle.port }]);
    expect(middle.tunnels).toEqual([{ host: '127.0.0.1', port: inner.port }]);
    expect(reaches(transport, 'correct-horse')).toBe(false);
    expect(reaches(transport, 'battery-staple')).toBe(false);
    // Port forwarding and commands go through to the host.
    const output: string[] = [];
    await transport.runCommand('echo hi', {
      onData: (bytes) => output.push(new TextDecoder().decode(bytes)),
      onClose: () => {},
    });
    await waitFor(() => inner.commands.length === 1);
    expect(outer.commands).toEqual([]);
  });

  it('names the jump host when it can’t go on', async () => {
    const closed = await startTestSshServer({ forwarding: false });
    const refused = open(2222, { jumps: [jump(closed.port, { password: 'correct-horse' })] });
    await waitFor(() => refused.screen.text.includes('(yes/no)? '));
    refused.transport.write('yes\r');
    await waitFor(() => refused.status() === 'closed');
    expect(refused.screen.statuses.at(-1)).toEqual({
      state: 'closed',
      message:
        "Bastion won't forward the connection to 127.0.0.1:2222: its SSH server has forwarding turned off (AllowTcpForwarding).",
    });

    // Port 1 is closed on any machine running tests.
    const bastion = await startTestSshServer();
    const nothing = open(1, { jumps: [jump(bastion.port, { password: 'correct-horse' })] });
    await waitFor(() => nothing.screen.text.includes('(yes/no)? '));
    nothing.transport.write('yes\r');
    await waitFor(() => nothing.status() === 'closed');
    expect(nothing.screen.statuses.at(-1)).toMatchObject({
      state: 'closed',
      message: expect.stringMatching(/^Bastion couldn't reach 127\.0\.0\.1:1\./),
      retry: true,
    });
  });

  it('names the jump host when signing in to it fails', async () => {
    const bastion = await startTestSshServer();
    const inner = await startInnerServer();
    const { transport, screen, status } = open(inner.port, { jumps: [jump(bastion.port)] });
    await waitFor(() => screen.text.includes('(yes/no)? '));
    transport.write('yes\r');
    await waitFor(() => screen.text.includes('password: '));

    transport.write('\x03');

    await waitFor(() => status() === 'closed');
    expect(screen.statuses.at(-1)).toEqual({
      state: 'closed',
      message: 'Bastion: Sign-in cancelled',
    });
    expect(bastion.tunnels).toEqual([]);
  });

  it('refuses a jump host whose key changed, and says where to forget it', async () => {
    const bastion = await startTestSshServer();
    const inner = await startInnerServer();
    const knownHosts = await trustBoth(bastion.port, inner.port);
    // A different server answering where the jump host was.
    const impostor = await startTestSshServer();
    knownHosts.entries[`127.0.0.1:${impostor.port}`] =
      knownHosts.entries[`127.0.0.1:${bastion.port}`];

    const { screen, status } = open(inner.port, {
      password: 'battery-staple',
      knownHosts,
      jumps: [jump(impostor.port, { password: 'correct-horse' })],
    });

    await waitFor(() => status() === 'closed');
    expect(screen.text).toContain('HAS CHANGED!');
    expect(screen.statuses.at(-1)).toEqual({
      state: 'closed',
      message:
        "Bastion's host key changed. If you expected that, forget the saved host key in Bastion's settings.",
    });
    expect(impostor.tunnels).toEqual([]);
  });

  it('ends the session, worth retrying, when the jump host’s connection drops', async () => {
    const bastion = await startTestSshServer();
    const inner = await startInnerServer();
    const knownHosts = await trustBoth(bastion.port, inner.port);
    const { status, screen } = open(inner.port, {
      password: 'battery-staple',
      knownHosts,
      jumps: [jump(bastion.port, { password: 'correct-horse' })],
    });
    await waitFor(() => status() === 'connected');

    testSockets.at(-1)!.destroy();

    await waitFor(() => status() === 'closed');
    expect(screen.statuses.at(-1)).toEqual({
      state: 'closed',
      message: 'Bastion: Connection lost',
      retry: true,
    });
  });

  it('ends at the jump host too when the session ends', async () => {
    const bastion = await startTestSshServer();
    const inner = await startInnerServer();
    const knownHosts = await trustBoth(bastion.port, inner.port);
    const { status, screen } = open(inner.port, {
      password: 'battery-staple',
      knownHosts,
      jumps: [jump(bastion.port, { password: 'correct-horse' })],
    });
    await waitFor(() => status() === 'connected');
    const socket = testSockets.at(-1)!;

    inner.shell().exit(0);
    inner.shell().end();

    await waitFor(() => status() === 'closed');
    expect(screen.statuses.at(-1)).toEqual({ state: 'closed', message: 'Session ended' });
    await waitFor(() => socket.destroyed);
  });
});
