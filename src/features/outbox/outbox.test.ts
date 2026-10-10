/**
 * @jest-environment node
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
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
  formatSize,
  isSettled,
  kindOf,
  listingReader,
  parseListing,
  readOutput,
  readScript,
  SEND_TO_PHONE_PROMPT,
  WATCH_SCRIPT,
  withSendToPhone,
  type HostFile,
  type Listing,
} from './outbox';
import { OutboxStore, type OutboxFile } from './outbox-store';
import { OutboxWatchers } from './outbox-watcher';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

const homes: string[] = [];
/** A home folder with an outbox, for the scripts' $HOME. */
function home(): { dir: string; outbox: string } {
  const dir = mkdtempSync(join(tmpdir(), 'flare-outbox-'));
  homes.push(dir);
  const outbox = join(dir, '.flare/outbox');
  mkdirSync(outbox, { recursive: true });
  return { dir, outbox };
}

/** Writes a file last changed a minute ago, so it has settled. */
function put(folder: string, name: string, text: string | Buffer, age = 60) {
  const path = join(folder, name);
  writeFileSync(path, text);
  const then = Date.now() / 1000 - age;
  utimesSync(path, then, then);
  return path;
}

afterEach(async () => {
  await stopTestSshServers();
  homes.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe('kindOf', () => {
  it('knows Markdown and HTML by the name’s ending, in any case', () => {
    expect(kindOf('plan.md')).toBe('markdown');
    expect(kindOf('Notes.MARKDOWN')).toBe('markdown');
    expect(kindOf('report.html')).toBe('html');
    expect(kindOf('index.HTM')).toBe('html');
  });

  it('is null for anything else', () => {
    expect(kindOf('notes.txt')).toBeNull();
    expect(kindOf('md')).toBeNull();
    expect(kindOf('archive.md.gz')).toBeNull();
    // Not a key an object inherits.
    expect(kindOf('x.constructor')).toBeNull();
  });
});

describe('parseListing', () => {
  it('reads the host’s clock and each file', () => {
    expect(
      parseListing('now 1760100000\n1760099990 1234 plan.md\n1760090000 9 my report.html\n')
    ).toEqual({
      now: 1760100000_000,
      files: [
        { name: 'plan.md', kind: 'markdown', size: 1234, modifiedAt: 1760099990_000 },
        { name: 'my report.html', kind: 'html', size: 9, modifiedAt: 1760090000_000 },
      ],
    });
  });

  it('skips what isn’t a file it lists', () => {
    expect(
      parseListing('stat: cannot stat\n1 2 notes.txt\n1 2 ../secret.md\r\n1 2 ok.md\r\n')
    ).toEqual({
      now: null,
      files: [{ name: 'ok.md', kind: 'markdown', size: 2, modifiedAt: 1000 }],
    });
  });

  it('lists a file once when two patterns name it (macOS ignores case)', () => {
    expect(parseListing('5 1 A.MD\n5 1 A.MD\n').files).toHaveLength(1);
  });
});

describe('listingReader', () => {
  it('waits for the end of each listing, however the output is split', () => {
    const listings: Listing[] = [];
    const read = listingReader((listing) => listings.push(listing));

    read('now 10\n9 1 a.md\nen');
    expect(listings).toEqual([]);
    read('d\nnow 20\nend\nnow 3');
    read('0\n29 2 b.md\nend\n');

    expect(listings.map(({ now, files }) => [now, files.map(({ name }) => name)])).toEqual([
      [10_000, ['a.md']],
      [20_000, []],
      [30_000, ['b.md']],
    ]);
  });
});

describe('isSettled', () => {
  const file: HostFile = { name: 'a.md', kind: 'markdown', size: 1, modifiedAt: 100_000 };

  it('waits until the file has gone unchanged for a moment by the host’s clock', () => {
    expect(isSettled(file, 101_000)).toBe(false);
    expect(isSettled(file, 102_000)).toBe(true);
    expect(isSettled(file, null)).toBe(true);
  });
});

describe('readOutput', () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it('is the file after its mark', () => {
    expect(readOutput(bytes('flare-file\n# Plan\n\ncafé ✓\n'))).toBe('# Plan\n\ncafé ✓\n');
    expect(readOutput(bytes('flare-file\n'))).toBe('');
  });

  it('is null when the host printed no file', () => {
    expect(readOutput(bytes(''))).toBeNull();
    expect(readOutput(bytes('cat: plan.md: No such file\n'))).toBeNull();
  });
});

describe('withSendToPhone', () => {
  it('asks after what’s written, as a sentence of its own', () => {
    expect(withSendToPhone('Write up the plan')).toBe(`Write up the plan. ${SEND_TO_PHONE_PROMPT}`);
    expect(withSendToPhone('Write up the plan!  ')).toBe(
      `Write up the plan! ${SEND_TO_PHONE_PROMPT}`
    );
    expect(withSendToPhone('  ')).toBe(SEND_TO_PHONE_PROMPT);
  });

  it('names the folder the app watches', () => {
    expect(SEND_TO_PHONE_PROMPT).toContain('~/.flare/outbox/');
  });
});

describe('formatSize', () => {
  it('says bytes, KB or MB', () => {
    expect(formatSize(820)).toBe('820 B');
    expect(formatSize(12_400)).toBe('12 KB');
    expect(formatSize(999_999)).toBe('1 MB');
    expect(formatSize(3_420_000)).toBe('3.4 MB');
  });
});

/** The first listing the watch script prints under `shell`, with `dir` as $HOME. */
function firstListing(shell: string, dir: string): Promise<Listing> {
  return new Promise((resolve, reject) => {
    // Its own process group, so stopping it stops its sleep too.
    const child = spawn(shell, ['-s', 'flare-outbox'], {
      env: { ...process.env, HOME: dir },
      detached: true,
    });
    const read = listingReader((listing) => {
      process.kill(-child.pid!, 'SIGKILL');
      resolve(listing);
    });
    child.stdout.on('data', (data: Buffer) => read(data.toString('utf8')));
    child.on('error', reject);
    child.stdin.end(WATCH_SCRIPT);
  });
}

describe('the scripts, under real shells', () => {
  it.each(['/bin/sh', 'bash'])('%s lists the outbox’s Markdown and HTML files', async (shell) => {
    const { dir, outbox } = home();
    const plan = put(outbox, 'plan.md', '# Plan\n');
    put(outbox, 'my report.html', '<p>Report</p>');
    put(outbox, 'notes.txt', 'not for the phone');
    mkdirSync(join(outbox, 'drafts.md'));
    // A link could point anywhere: only files written into the folder come over.
    symlinkSync(plan, join(outbox, 'link.md'));

    const { now, files } = await firstListing(shell, dir);

    expect(Math.abs(now! - Date.now())).toBeLessThan(5000);
    expect(files.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      {
        name: 'my report.html',
        kind: 'html',
        size: 13,
        modifiedAt: Math.floor(statSync(join(outbox, 'my report.html')).mtimeMs / 1000) * 1000,
      },
      {
        name: 'plan.md',
        kind: 'markdown',
        size: 7,
        modifiedAt: Math.floor(statSync(plan).mtimeMs / 1000) * 1000,
      },
    ]);
  });

  it('lists nothing, and carries on, before the agent makes the folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flare-outbox-'));
    homes.push(dir);
    await expect(firstListing('/bin/sh', dir)).resolves.toEqual({
      now: expect.any(Number),
      files: [],
    });
  });

  it.each(['/bin/sh', 'bash'])('%s reads a file, whatever its name', (shell) => {
    const { dir, outbox } = home();
    const name = `it's a "plan" $(id).md`;
    put(outbox, name, '# Plan\n\ncafé ✓\n');
    const run = (file: string) =>
      spawnSync(shell, ['-s', 'flare-outbox-read'], {
        input: readScript(file),
        env: { ...process.env, HOME: dir },
      });

    expect(readOutput(run(name).stdout)).toBe('# Plan\n\ncafé ✓\n');
    expect(readOutput(run('gone.md').stdout)).toBeNull();
    // Made a link since the listing: not read.
    symlinkSync(join(outbox, name), join(outbox, 'link.md'));
    expect(readOutput(run('link.md').stdout)).toBeNull();
  });
});

describe('over SSH', () => {
  const knownHosts: KnownHosts = { get: () => null, trust: () => {}, forget: () => {} };

  it('brings the host’s files to the phone through the session’s connection', async () => {
    const { dir, outbox } = home();
    put(outbox, 'plan.md', '# Plan\n\ncafé ✓\n', 120);
    // Bigger than the 2 MiB window ssh2 opens, so the host waits on the phone's adjustments.
    const report = `<!doctype html><pre>${'x'.repeat(3_000_000)}</pre>`;
    put(outbox, 'report.html', report, 60);

    const server = await startTestSshServer({ home: dir });
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
          // The question is printed before the transport listens for the answer.
          if (text.includes('(yes/no)?')) setTimeout(() => transport.write('yes\r'));
        },
        onTitle: () => {},
        onStatus: (status) => statuses.push(status.state),
      }
    );
    transport.connect({ cols: 80, rows: 24 });
    await waitFor(() => statuses.at(-1) === 'connected');

    const store = new OutboxStore();
    const watchers = new OutboxWatchers({
      store,
      run: (_sessionId, command, events) => transport.runCommand(command, events),
    });
    const arrivals: OutboxFile[][] = [];
    watchers.setArrivalHandler((files) => arrivals.push(files));
    watchers.update([{ connectionId: 'devbox', sessionId: 's1', host: 'Devbox' }]);

    await waitFor(() => arrivals.length === 1, 10_000);
    expect(arrivals[0].map(({ name, host }) => [name, host])).toEqual([
      ['report.html', 'Devbox'],
      ['plan.md', 'Devbox'],
    ]);
    const [reportFile, planFile] = arrivals[0];
    expect(store.text(planFile.id)).toBe('# Plan\n\ncafé ✓\n');
    expect(store.text(reportFile.id) === report).toBe(true);
    expect(server.commands).toEqual([
      'sh -s flare-outbox',
      'sh -s flare-outbox-read',
      'sh -s flare-outbox-read',
    ]);

    watchers.stopAll();
    // The terminal carries on.
    expect(statuses.at(-1)).toBe('connected');
    transport.close();
  });
});
