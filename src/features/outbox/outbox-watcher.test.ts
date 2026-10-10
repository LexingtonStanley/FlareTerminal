/**
 * @jest-environment node
 */
import type { Connection } from '@/features/connections/connections';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import type { TunnelEvents } from '@/features/terminal/transport';
import { clearMemoryStorage } from '@/test-utils/memory-storage';

import { MAX_FILE_BYTES, readScript, WATCH_SCRIPT } from './outbox';
import { KEEP_FILES, OutboxStore, type OutboxFile } from './outbox-store';
import {
  OutboxWatchers,
  READ_COMMAND,
  readTimeout,
  WATCH_COMMAND,
  watchTargets,
  type WatchTarget,
} from './outbox-watcher';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

type HostCommand = {
  sessionId: string;
  command: string;
  events: TunnelEvents;
  sent: string;
  closed: boolean;
};

/** The hosts' side: every command the watchers ran. */
function fakeHosts({ refuse = false } = {}) {
  const commands: HostCommand[] = [];
  return {
    commands,
    run: async (sessionId: string, command: string, events: TunnelEvents) => {
      if (refuse) throw new Error('The host refused to run a command');
      const run: HostCommand = { sessionId, command, events, sent: '', closed: false };
      commands.push(run);
      return {
        write: (bytes: Uint8Array) => (run.sent += new TextDecoder().decode(bytes)),
        close: () => (run.closed = true),
      };
    },
    watches: () => commands.filter(({ command }) => command === WATCH_COMMAND),
    reads: () => commands.filter(({ command }) => command === READ_COMMAND),
  };
}

const bytes = (text: string) => new TextEncoder().encode(text);
/** Lets the watchers' promises run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** The host prints a listing. */
async function list(watch: HostCommand, text: string) {
  watch.events.onData(bytes(text));
  await settle();
}

/** The host prints a file (or nothing, when it's gone) and the command ends. */
async function answer(read: HostCommand, text: string | null) {
  if (text !== null) read.events.onData(bytes(`flare-file\n${text}`));
  read.events.onClose();
  await settle();
}

const DEVBOX: WatchTarget = { connectionId: 'devbox', sessionId: 's1', host: 'Devbox' };

let store: OutboxStore;
let arrivals: OutboxFile[][];
const started: OutboxWatchers[] = [];

beforeEach(() => {
  clearMemoryStorage();
  store = new OutboxStore();
  arrivals = [];
});
// A read the host never answered would keep its timer.
afterEach(() => started.splice(0).forEach((watchers) => watchers.stopAll()));

async function watch(hosts: ReturnType<typeof fakeHosts>, targets = [DEVBOX]) {
  const watchers = new OutboxWatchers({ store, run: hosts.run, now: () => 5000 });
  started.push(watchers);
  watchers.setArrivalHandler((files) => arrivals.push(files));
  watchers.update(targets);
  await settle();
  return watchers;
}

describe('watchTargets', () => {
  const connection = (id: string, kind: 'ssh' | 'ttyd' = 'ssh') =>
    ({ id, kind, name: id.toUpperCase() }) as Connection;
  const session = (id: string, connectionId: string, state = 'connected') =>
    ({ id, connectionId, status: { state } }) as SessionSnapshot;

  it('picks one connected SSH session for each host', () => {
    expect(
      watchTargets(
        [
          session('s1', 'a', 'connecting'),
          session('s2', 'a'),
          session('s3', 'a'),
          session('s4', 'b'),
          session('s5', 'web'),
          session('s6', 'gone'),
        ],
        [connection('a'), connection('b'), connection('web', 'ttyd')]
      )
    ).toEqual([
      { connectionId: 'a', sessionId: 's2', host: 'A' },
      { connectionId: 'b', sessionId: 's4', host: 'B' },
    ]);
  });
});

describe('OutboxWatchers', () => {
  it('runs the watch script beside the session', async () => {
    const hosts = fakeHosts();
    await watch(hosts);

    expect(hosts.commands).toEqual([
      expect.objectContaining({ sessionId: 's1', command: WATCH_COMMAND, sent: WATCH_SCRIPT }),
    ]);
  });

  it('fetches new files one at a time, oldest first, and says what came', async () => {
    const hosts = fakeHosts();
    await watch(hosts);
    const [watcher] = hosts.watches();

    await list(watcher, 'now 100\n90 4 new.md\n80 6 old.html\nend\n');
    expect(hosts.reads().map(({ sent }) => sent)).toEqual([readScript('old.html')]);
    await answer(hosts.reads()[0], '<p>Hi</p>');
    expect(hosts.reads().map(({ sent }) => sent)).toEqual([
      readScript('old.html'),
      readScript('new.md'),
    ]);
    await answer(hosts.reads()[1], '# New');

    expect(arrivals.map((files) => files.map(({ name }) => name))).toEqual([
      ['new.md', 'old.html'],
    ]);
    const [newest] = store.getSnapshot();
    expect(newest).toMatchObject({ name: 'new.md', host: 'Devbox', receivedAt: 5000 });
    expect(store.text(newest.id)).toBe('# New');
    expect(hosts.reads().every(({ closed }) => closed)).toBe(true);
  });

  it('fetches nothing it already has', async () => {
    const hosts = fakeHosts();
    await watch(hosts);
    const [watcher] = hosts.watches();
    await list(watcher, 'now 100\n90 4 plan.md\nend\n');
    await answer(hosts.reads()[0], '# Hi');

    await list(watcher, 'now 105\n90 4 plan.md\nend\n');

    expect(hosts.reads()).toHaveLength(1);
    expect(arrivals).toHaveLength(1);
  });

  it('waits for a file the agent is still writing', async () => {
    const hosts = fakeHosts();
    await watch(hosts);
    const [watcher] = hosts.watches();

    await list(watcher, 'now 100\n99 4 plan.md\nend\n');
    expect(hosts.reads()).toEqual([]);

    await list(watcher, 'now 105\n99 4 plan.md\nend\n');
    expect(hosts.reads()).toHaveLength(1);
  });

  it('leaves files past the most the phone keeps on the host', async () => {
    const hosts = fakeHosts();
    await watch(hosts);
    const [watcher] = hosts.watches();
    const names = Array.from({ length: KEEP_FILES + 2 }, (_, i) => `${i}.md`);
    // 0.md is the oldest.
    const listing = names.map((name, i) => `${i + 10} 1 ${name}`).join('\n');

    await list(watcher, `now 1000\n${listing}\nend\n`);
    for (let i = 0; i < KEEP_FILES; i++) await answer(hosts.reads()[i], 'x');
    await list(watcher, `now 1005\n${listing}\nend\n`);

    expect(hosts.reads()).toHaveLength(KEEP_FILES);
    expect(hosts.reads()[0].sent).toBe(readScript('2.md'));
    expect(store.getSnapshot()[0].name).toBe(`${KEEP_FILES + 1}.md`);
    expect(store.getSnapshot()).toHaveLength(KEEP_FILES);
  });

  it('lists a file too big to bring over without reading it', async () => {
    const hosts = fakeHosts();
    await watch(hosts);

    await list(hosts.watches()[0], `now 100\n90 ${MAX_FILE_BYTES + 1} huge.md\nend\n`);

    expect(hosts.reads()).toEqual([]);
    expect(arrivals).toEqual([[expect.objectContaining({ name: 'huge.md', tooBig: true })]]);
  });

  it('stops reading a file that grew past the limit', async () => {
    const hosts = fakeHosts();
    await watch(hosts);
    await list(hosts.watches()[0], 'now 100\n90 4 plan.md\nend\n');
    const [read] = hosts.reads();

    read.events.onData(new Uint8Array(MAX_FILE_BYTES + 100));
    await settle();

    expect(read.closed).toBe(true);
    expect(arrivals).toEqual([[expect.objectContaining({ name: 'plan.md', tooBig: true })]]);
  });

  it('keeps nothing of a file that went before it was read, and looks again next time', async () => {
    const hosts = fakeHosts();
    await watch(hosts);
    const [watcher] = hosts.watches();
    await list(watcher, 'now 100\n90 4 plan.md\nend\n');

    await answer(hosts.reads()[0], null);
    expect(store.getSnapshot()).toEqual([]);
    expect(arrivals).toEqual([]);

    await list(watcher, 'now 105\n90 4 plan.md\nend\n');
    expect(hosts.reads()).toHaveLength(2);
  });

  it('gives up on a read the host doesn’t answer, and tries again', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const hosts = fakeHosts();
      await watch(hosts);
      const [watcher] = hosts.watches();
      await list(watcher, 'now 100\n90 4 plan.md\nend\n');

      jest.advanceTimersByTime(readTimeout(4));
      await settle();
      expect(hosts.reads()[0].closed).toBe(true);

      await list(watcher, 'now 105\n90 4 plan.md\nend\n');
      expect(hosts.reads()).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('moves to another session of the host, and stops when none is connected', async () => {
    const hosts = fakeHosts();
    const watchers = await watch(hosts);
    const [first] = hosts.watches();

    watchers.update([{ ...DEVBOX, sessionId: 's2' }]);
    await settle();
    expect(first.closed).toBe(true);
    expect(hosts.watches().map(({ sessionId }) => sessionId)).toEqual(['s1', 's2']);

    watchers.update([]);
    expect(hosts.watches()[1].closed).toBe(true);
  });

  it('doesn’t ask again on the same session once its command ended', async () => {
    const hosts = fakeHosts();
    const watchers = await watch(hosts);
    hosts.watches()[0].events.onClose();

    watchers.update([DEVBOX]);
    await settle();
    expect(hosts.watches()).toHaveLength(1);

    // A reconnect is a session away and back.
    watchers.update([]);
    watchers.update([DEVBOX]);
    await settle();
    expect(hosts.watches()).toHaveLength(2);
  });

  it('closes the watch and a read under way when it stops', async () => {
    const hosts = fakeHosts();
    const watchers = await watch(hosts);
    await list(hosts.watches()[0], 'now 100\n90 4 plan.md\nend\n');

    watchers.stopAll();
    await settle();

    expect(hosts.commands.every(({ closed }) => closed)).toBe(true);
    expect(arrivals).toEqual([]);
  });

  it('does nothing on a host that won’t run commands', async () => {
    const hosts = fakeHosts({ refuse: true });
    await watch(hosts);
    expect(hosts.commands).toEqual([]);
  });
});
