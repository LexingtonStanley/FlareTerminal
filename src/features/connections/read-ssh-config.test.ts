/**
 * @jest-environment node
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { KnownHosts } from '@/features/ssh/known-hosts';
import { SshTransport } from '@/features/terminal/ssh-transport';
import type { Tunnel, TunnelEvents } from '@/features/terminal/transport';
import {
  openNodeSocket,
  startTestSshServer,
  stopTestSshServers,
  waitFor,
} from '@/test-utils/ssh-server';

import { READ_CONFIG_COMMAND, readOutput, readScript, readSshConfig } from './read-ssh-config';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flare-ssh-config-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await stopTestSshServers();
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe('readScript', () => {
  it('looks for each pattern where OpenSSH would, and ends by saying so', () => {
    const script = readScript(['config', '~/.orbstack/ssh/config', '/etc/ssh/extra'], 'M');
    expect(script).toContain(`cd "$HOME/.ssh" 2>/dev/null && p='config' && for f in $p; do emit 0`);
    expect(script).toContain(`cd "$HOME" 2>/dev/null && p='.orbstack/ssh/config'`);
    expect(script).toContain(`cd / 2>/dev/null && p='etc/ssh/extra'`);
    expect(script.endsWith('echo "M end"; exit\n')).toBe(true);
  });

  it('skips another person’s files', () => {
    expect(readScript(['~root/.ssh/config'], 'M')).not.toContain('root');
  });

  it('quotes a pattern', () => {
    expect(readScript(["it's/*"], 'M')).toContain(`p='it'\\''s/*'`);
  });
});

describe('readOutput', () => {
  it('splits the files by the marker', () => {
    const output = [
      'Welcome!', // A login script's chatter comes first.
      'M 0',
      'Host a',
      '',
      'M 1',
      'Host b',
      'M 1',
      'Host c',
      '',
      'M end',
      '',
    ].join('\n');
    expect(readOutput(output, 'M', 2)).toEqual([['Host a\n'], ['Host b', 'Host c\n']]);
  });

  it('is null when the script didn’t finish', () => {
    expect(readOutput('M 0\nHost a\n', 'M', 1)).toBeNull();
  });
});

/** A host that runs the script with `answer`, which gets the marker the script used. */
function fakeHost(answer: (marker: string, script: string) => string) {
  const host = {
    commands: [] as string[],
    scripts: [] as string[],
    run: async (command: string, events: TunnelEvents): Promise<Tunnel> => {
      host.commands.push(command);
      return {
        write: (bytes) => {
          const script = new TextDecoder().decode(bytes);
          host.scripts.push(script);
          const marker = /echo "(flare-[0-9a-f]{16}) end"/.exec(script)![1];
          events.onData(new TextEncoder().encode(answer(marker, script)));
          events.onClose();
        },
        close: () => {},
      };
    },
  };
  return host;
}

describe('readSshConfig', () => {
  it('reads the config, then the files its Include lines name', async () => {
    const host = fakeHost((marker, script) =>
      script.includes("p='config'")
        ? `${marker} 0\nInclude conf.d/*\nHost lexbox\n${marker} end\n`
        : `${marker} 0\nHost work\n${marker} 0\nHost home\n${marker} end\n`
    );

    const found = await readSshConfig(host.run);

    expect(found?.hosts.map(({ alias }) => alias)).toEqual(['work', 'home', 'lexbox']);
    expect(host.commands).toEqual([READ_CONFIG_COMMAND, READ_CONFIG_COMMAND]);
  });

  it('is null when the computer has no config', async () => {
    const host = fakeHost((marker) => `${marker} end\n`);
    await expect(readSshConfig(host.run)).resolves.toBeNull();
  });

  it('says so when the session isn’t connected', async () => {
    const run = () => Promise.reject(new Error('Not connected'));
    await expect(readSshConfig(run)).rejects.toThrow('The session isn’t connected');
  });

  it('stops waiting for a computer that doesn’t answer', async () => {
    const run = async (): Promise<Tunnel> => ({ write: () => {}, close: () => {} });
    await expect(readSshConfig(run, { timeout: 10 })).rejects.toThrow(
      'The computer stopped answering'
    );
  });
});

describe('over SSH', () => {
  const knownHosts: KnownHosts = { get: () => null, trust: () => {}, forget: () => {} };

  it('reads ~/.ssh/config and its includes, and runs nothing they name', async () => {
    const home = tempDir();
    const ssh = join(home, '.ssh');
    mkdirSync(join(ssh, 'conf.d'), { recursive: true });
    mkdirSync(join(home, '.orbstack'));
    const dotfiles = tempDir();
    const pwned = join(home, 'pwned');
    writeFileSync(
      join(dotfiles, 'config'),
      [
        'Include conf.d/*.conf',
        'Include ~/.orbstack/config',
        `Include "$(touch ${pwned})" \`touch ${pwned}\``,
        'Host lexbox',
        '  User lexde',
      ].join('\n')
    );
    // Dotfiles often link the config in from a repository.
    symlinkSync(join(dotfiles, 'config'), join(ssh, 'config'));
    writeFileSync(join(ssh, 'conf.d', 'a.conf'), 'Host work\n  HostName work.example.com');
    writeFileSync(join(ssh, 'conf.d', 'b.conf'), 'Host *\n  Port 2222\n'); // No final newline above.
    writeFileSync(join(ssh, 'conf.d', 'notes.txt'), 'Host notes');
    writeFileSync(join(home, '.orbstack', 'config'), 'Host orb\n  HostName 127.0.0.1');

    const server = await startTestSshServer({ home });
    const statuses: string[] = [];
    const transport: SshTransport = new SshTransport(
      {
        host: '127.0.0.1',
        port: server.port,
        username: 'ada',
        password: 'correct-horse',
        userKeys: [],
        knownHosts,
        openSocket: openNodeSocket,
        keepaliveInterval: 0,
      },
      {
        onData: (text) => {
          if (text.includes('(yes/no)?')) setTimeout(() => transport.write('yes\r'));
        },
        onTitle: () => {},
        onStatus: (status) => statuses.push(status.state),
      }
    );
    transport.connect({ cols: 80, rows: 24 });
    await waitFor(() => statuses.at(-1) === 'connected');

    const found = await readSshConfig((command, events) => transport.runCommand(command, events));

    expect(found?.hosts).toEqual([
      { alias: 'work', hostName: 'work.example.com', user: null, port: 2222, jump: false },
      { alias: 'orb', hostName: '127.0.0.1', user: null, port: 2222, jump: false },
      { alias: 'lexbox', hostName: 'lexbox', user: 'lexde', port: 2222, jump: false },
    ]);
    expect(existsSync(pwned)).toBe(false);
    expect(statuses.at(-1)).toBe('connected');
    transport.close();
  });
});
