/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { KnownHosts } from '@/features/ssh/known-hosts';
import { SshTransport } from '@/features/terminal/ssh-transport';
import {
  openNodeSocket,
  startTestSshServer,
  stopTestSshServers,
  waitFor,
} from '@/test-utils/ssh-server';

import {
  diskUsed,
  formatBytes,
  formatUptime,
  HEALTH_INTERVAL,
  HEALTH_SCRIPT,
  healthReader,
  memoryUsed,
  parseHealth,
  type HostHealth,
} from './health';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

afterEach(() => stopTestSshServers());

/** One round of the script under this machine's sh, as the host's `sh -s` would run it. */
function runOnce(script = HEALTH_SCRIPT, env: NodeJS.ProcessEnv = process.env) {
  const once = script.replace(`sleep ${HEALTH_INTERVAL} || exit`, 'exit');
  const run = spawnSync('/bin/sh', ['-s'], { input: once, env, encoding: 'utf8' });
  const readings: HostHealth[] = [];
  healthReader((health) => readings.push(health))(run.stdout);
  return readings;
}

describe('the health script', () => {
  it('reads this machine', () => {
    const [health] = runOnce();

    expect(health.load).toHaveLength(3);
    expect(health.cpus).toBeGreaterThan(0);
    expect(health.memory!.total).toBeGreaterThan(health.memory!.available);
    expect(health.disk!.total).toBeGreaterThan(0);
    expect(health.uptime).toBeGreaterThan(0);
  });

  it('reads a Mac (sysctl and vm_stat)', () => {
    // Commands that answer as macOS does, ahead of this machine's on the PATH.
    const bin = mkdtempSync(join(tmpdir(), 'flare-mac-'));
    const fake = (name: string, body: string) => {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    };
    fake(
      'sysctl',
      `case "$2" in
        vm.loadavg) echo "{ 1.83 2.01 2.10 }" ;;
        kern.boottime) echo "{ sec = $(( $(date +%s) - 90000 )), usec = 123456 } Mon Oct  2 10:00:00 2023" ;;
        hw.ncpu) echo 10 ;;
        hw.memsize) echo 17179869184 ;;
      esac`
    );
    fake(
      'vm_stat',
      `cat <<'END'
Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               12000.
Pages active:                            400000.
Pages inactive:                          200000.
Pages speculative:                         8000.
Pages throttled:                              0.
Pages wired down:                        150000.
Pages purgeable:                          30000.
END`
    );
    try {
      const [health] = runOnce(
        // As if there were no /proc.
        HEALTH_SCRIPT.replace('[ -r /proc/loadavg ]', '[ -r /no/such/file ]'),
        { ...process.env, PATH: `${bin}:${process.env.PATH}` }
      );

      expect(health.load).toEqual([1.83, 2.01, 2.1]);
      expect(health.cpus).toBe(10);
      expect(health.memory).toEqual({ total: 17179869184, available: 250000 * 16384 });
      expect(health.uptime).toBeGreaterThanOrEqual(90000);
      expect(health.disk!.total).toBeGreaterThan(0);
    } finally {
      rmSync(bin, { recursive: true });
    }
  });
});

describe('through SSH', () => {
  it('reads the host from a command beside the shell, until it stops', async () => {
    const server = await startTestSshServer({
      authenticate: (ctx) => (ctx.method === 'none' ? ctx.accept() : ctx.reject()),
    });
    const trustAll: KnownHosts = { get: () => null, trust: () => {}, forget: () => {} };
    const statuses: string[] = [];
    const transport: SshTransport = new SshTransport(
      {
        host: '127.0.0.1',
        port: server.port,
        username: 'ada',
        password: null,
        userKeys: [],
        knownHosts: trustAll,
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

    const readings: HostHealth[] = [];
    const read = healthReader((health) => readings.push(health));
    let ended = false;
    const command = await transport.runCommand('sh -s', {
      onData: (bytes) => read(new TextDecoder().decode(bytes)),
      onClose: () => (ended = true),
    });
    command.write(new TextEncoder().encode(HEALTH_SCRIPT));

    await waitFor(() => readings.length === 1);
    expect(readings[0].memory).not.toBeNull();
    expect(server.commands).toEqual(['sh -s']);
    command.close();
    expect(ended).toBe(false);
    expect(statuses.at(-1)).toBe('connected');
    transport.close();
  });
});

describe('parseHealth', () => {
  it('reads a Linux block', () => {
    expect(
      parseHealth(
        'load 0.42 0.67 0.63\nuptime 7827.88\ncpus 4\nmemkb 16480952 4120238\ndiskkb 1000 700 250\n'
      )
    ).toEqual({
      load: [0.42, 0.67, 0.63],
      uptime: 7827.88,
      cpus: 4,
      memory: { total: 16480952 * 1024, available: 4120238 * 1024 },
      disk: { total: 1000 * 1024, used: 700 * 1024, available: 250 * 1024 },
    });
  });

  it('keeps what it can read and skips the rest', () => {
    // An old kernel without MemAvailable, a Mac without sysctl, and a shell's own noise.
    expect(parseHealth('Welcome!\nload \nmemkb 16480952\ncpus \ndiskkb 1000 700 250\n')).toEqual({
      load: null,
      uptime: null,
      cpus: null,
      memory: null,
      disk: { total: 1000 * 1024, used: 700 * 1024, available: 250 * 1024 },
    });
  });

  it('says nothing for output that isn’t a reading', () => {
    expect(parseHealth("sh: 1: getconf: not found\n'sh' is not recognized\n")).toBeNull();
    expect(parseHealth('')).toBeNull();
  });
});

describe('healthReader', () => {
  it('reads a block once its end line arrives, in any pieces', () => {
    const readings: HostHealth[] = [];
    const push = healthReader((health) => readings.push(health));

    push('load 1 2 3\nupt');
    push('ime 60\r\ne');
    expect(readings).toEqual([]);
    push('nd\r\nload 4 5 6\nend\n');

    expect(readings.map(({ load, uptime }) => ({ load, uptime }))).toEqual([
      { load: [1, 2, 3], uptime: 60 },
      { load: [4, 5, 6], uptime: null },
    ]);
  });
});

describe('formatting', () => {
  it('says how full memory and disk are, as df does for a disk', () => {
    expect(memoryUsed({ total: 100, available: 25 })).toBe(0.75);
    // ext4 keeps 5% back: df's Use% leaves it out.
    expect(diskUsed({ total: 100, used: 57, available: 38 })).toBeCloseTo(0.6);
  });

  it('writes uptimes and sizes briefly', () => {
    expect([59, 3600 * 5 + 1, 86400 * 3 + 7200].map(formatUptime)).toEqual(['0m', '5h', '3d']);
    expect(
      [512 * 1024 ** 2, 6.94 * 1024 ** 3, 15.2 * 1024 ** 3, 460 * 1024 ** 3].map(formatBytes)
    ).toEqual(['512 MB', '6.9 GB', '15 GB', '460 GB']);
  });
});
