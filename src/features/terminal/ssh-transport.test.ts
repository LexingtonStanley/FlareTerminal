/**
 * @jest-environment node
 */
import type { KnownHost, KnownHosts } from '@/features/ssh/known-hosts';
import {
  openNodeSocket,
  startTestSshServer,
  stopTestSshServers,
  waitFor,
} from '@/test-utils/ssh-server';

import { SshTransport } from './ssh-transport';
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

function open(
  port: number,
  { password = null as string | null, knownHosts = memoryKnownHosts() } = {}
) {
  const screen = { text: '', statuses: [] as SessionStatus[], modes: [] as InputMode[] };
  const transport = new SshTransport(
    {
      host: '127.0.0.1',
      port,
      username: 'ada',
      password,
      userKey: null,
      knownHosts,
      openSocket: openNodeSocket,
      keepaliveInterval: 0,
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
    const server = await startTestSshServer();
    const port = server.port;
    await stopTestSshServers();
    const { screen, status } = open(port);

    await waitFor(() => status() === 'closed');
    expect(screen.statuses.at(-1)).toEqual({
      state: 'closed',
      message: expect.stringMatching(new RegExp(`^Couldn't reach 127\\.0\\.0\\.1:${port}\\.`)),
    });
  });
});
