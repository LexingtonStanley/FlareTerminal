/**
 * @jest-environment node
 */
import type {
  SessionStatus,
  TerminalSize,
  TerminalTransport,
  TransportListener,
} from '@/features/terminal/transport';

import {
  FINISH_SETTLE_MS,
  RECONNECT_DELAYS_MS,
  SessionManager,
  type Attention,
  type SessionSnapshot,
} from './session-manager';

class FakeTransport implements TerminalTransport {
  size: TerminalSize | null = null;
  written: string[] = [];
  resizes: TerminalSize[] = [];
  closed = false;
  /** Times it was asked to check the connection still works (SSH can). */
  checks = 0;
  constructor(readonly listener: TransportListener) {}
  connect(size: TerminalSize) {
    this.size = size;
    this.listener.onStatus({ state: 'connecting' });
  }
  write(data: string) {
    this.written.push(data);
  }
  resize(size: TerminalSize) {
    this.resizes.push(size);
  }
  close() {
    this.closed = true;
  }
  checkAlive() {
    this.checks++;
  }
  status(status: SessionStatus) {
    this.listener.onStatus(status);
  }
  output(text: string) {
    this.listener.onData(text);
  }
}

function setup({ connections = ['box'] } = {}) {
  const transports: FakeTransport[] = [];
  const alerts: { session: SessionSnapshot; attention: Attention; appActive: boolean }[] = [];
  const timers: { ms: number; run: () => void; cancelled: boolean }[] = [];
  let now = 1_000_000;
  const manager = new SessionManager({
    openTransport: (connectionId, listener) => {
      if (!connections.includes(connectionId)) return null;
      const transport = new FakeTransport(listener);
      transports.push(transport);
      return transport;
    },
    onAttention: (session, attention, appActive) => alerts.push({ session, attention, appActive }),
    now: () => now,
    delay: (run, ms) => {
      const timer = { ms, run, cancelled: false };
      timers.push(timer);
      return () => (timer.cancelled = true);
    },
  });
  const view = () => {
    const sink = {
      text: '',
      resets: 0,
      write: (d: string) => (sink.text += d),
      reset: () => sink.resets++,
    };
    return sink;
  };
  return {
    manager,
    transports,
    alerts,
    timers,
    view,
    advance: (ms: number) => (now += ms),
    session: (id: string) => manager.getSnapshot().find((s) => s.id === id)!,
  };
}

const SIZE = { cols: 40, rows: 12 };
/** Lets the headless terminal parse everything written so far. */
const parsed = (manager: SessionManager, id: string) =>
  new Promise<void>((resolve) => manager.screen(id)!.write('', resolve));

describe('SessionManager', () => {
  it('connects when a view first attaches, at the view size', () => {
    const { manager, transports, view } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Box', command: null });
    expect(transports).toHaveLength(0);

    const sink = view();
    manager.attach(id, sink, SIZE);
    transports[0].output('hello');

    expect(transports[0].size).toEqual(SIZE);
    expect(sink.text).toBe('hello');
  });

  it('keeps a session running without a view and replays its screen on return', async () => {
    const { manager, transports, view } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Box', command: null });
    const first = view();
    manager.attach(id, first, SIZE);
    transports[0].output('line one\r\n');

    manager.detach(id, first);
    transports[0].output('\x1b[32mwhile away\x1b[0m\r\n');
    expect(first.text).toBe('line one\r\n');

    const second = view();
    manager.attach(id, second, SIZE);
    transports[0].output('after return');
    await parsed(manager, id);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(second.resets).toBe(1);
    expect(second.text).toMatch(/line one[\s\S]*while away[\s\S]*after return$/);
    expect(second.text).toContain('\x1b[32m');
  });

  it('types the startup command once connected, and again after reconnecting', () => {
    const { manager, transports, view } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Claude', command: 'claude' });
    manager.attach(id, view(), SIZE);

    transports[0].status({ state: 'connected' });
    transports[0].status({ state: 'connected' });
    expect(transports[0].written).toEqual(['claude\r']);

    manager.reconnect(id);
    transports[1].status({ state: 'connected' });
    expect(transports[0].closed).toBe(true);
    expect(transports[1].written).toEqual(['claude\r']);
  });

  it('reconnects a session whose connection dropped, backing off, then waits', () => {
    const { manager, transports, timers, view, session } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Claude', command: 'claude' });
    manager.attach(id, view(), SIZE);
    transports[0].status({ state: 'connected' });

    transports[0].status({ state: 'closed', message: 'Connection lost', retry: true });
    expect(session(id).reconnecting).toBe(true);
    for (const [attempt, ms] of RECONNECT_DELAYS_MS.entries()) {
      expect(timers.at(-1)?.ms).toBe(ms);
      timers.at(-1)!.run();
      expect(transports).toHaveLength(attempt + 2);
      expect(session(id).reconnecting).toBe(false);
      const transport = transports[attempt + 1];
      transport.status({ state: 'closed', message: "Couldn't reach box", retry: true });
    }
    // Out of retries: it waits, until the app comes back on screen.
    expect(timers).toHaveLength(RECONNECT_DELAYS_MS.length);
    expect(session(id).status).toMatchObject({ state: 'closed' });
    manager.setAppActive(false);
    manager.setAppActive(true);
    expect(transports).toHaveLength(RECONNECT_DELAYS_MS.length + 2);

    // Connected again: the command reattaches (tmux new -A, zellij attach -c).
    transports.at(-1)!.status({ state: 'connected' });
    expect(transports.at(-1)!.written).toEqual(['claude\r']);
  });

  it('leaves sessions that ended, were refused or never connected', () => {
    const { manager, transports, timers, view } = setup();
    const ended = manager.start({ connectionId: 'box', name: 'Box', command: null });
    manager.attach(ended, view(), SIZE);
    transports[0].status({ state: 'connected' });
    transports[0].status({ state: 'closed', message: 'Session ended' });

    const unreachable = manager.start({ connectionId: 'box', name: 'Box', command: null });
    manager.attach(unreachable, view(), SIZE);
    transports[1].status({ state: 'closed', message: "Couldn't reach box", retry: true });

    manager.setAppActive(true);
    expect(timers).toHaveLength(0);
    expect(transports).toHaveLength(2);
  });

  describe('the phone’s network', () => {
    const WIFI = { online: true, kind: 'WIFI' };
    const CELLULAR = { online: true, kind: 'CELLULAR' };
    const OFFLINE = { online: false, kind: 'NONE' };

    function dropped() {
      const env = setup();
      const id = env.manager.start({ connectionId: 'box', name: 'Claude', command: 'claude' });
      env.manager.attach(id, env.view(), SIZE);
      env.transports[0].status({ state: 'connected' });
      return { ...env, id };
    }

    it('waits for a network instead of using up its retries', () => {
      const { manager, transports, timers, session, id } = dropped();
      manager.setNetwork(WIFI);
      manager.setNetwork(OFFLINE);

      transports[0].status({ state: 'closed', message: 'Connection lost', retry: true });
      expect(timers).toHaveLength(0);
      expect(session(id)).toMatchObject({ reconnecting: true, waitingFor: 'network' });

      manager.setNetwork(CELLULAR);
      expect(transports).toHaveLength(2);
      expect(session(id)).toMatchObject({ reconnecting: false, waitingFor: null });
      transports[1].status({ state: 'connected' });
      expect(transports[1].written).toEqual(['claude\r']);
    });

    it('stops a scheduled retry when the network goes', () => {
      const { manager, transports, timers, session, id } = dropped();
      transports[0].status({ state: 'closed', message: 'Connection lost', retry: true });
      expect(timers).toHaveLength(1);

      manager.setNetwork(OFFLINE);

      expect(timers[0].cancelled).toBe(true);
      expect(session(id)).toMatchObject({ reconnecting: true, waitingFor: 'network' });
      manager.setNetwork(WIFI);
      expect(transports).toHaveLength(2);
    });

    it('reconnects at once on a new network, even out of retries', () => {
      const { manager, transports, timers, id, session } = dropped();
      manager.setNetwork(WIFI);
      transports[0].status({ state: 'closed', message: 'Connection lost', retry: true });
      for (const [attempt] of RECONNECT_DELAYS_MS.entries()) {
        timers.at(-1)!.run();
        transports[attempt + 1].status({ state: 'closed', message: 'No route', retry: true });
      }
      expect(session(id).reconnecting).toBe(false);

      manager.setNetwork(CELLULAR);

      expect(transports).toHaveLength(RECONNECT_DELAYS_MS.length + 2);
    });

    it('checks an open connection when the network changes, and only then', () => {
      const { manager, transports } = dropped();
      manager.setNetwork(WIFI);
      manager.setNetwork(WIFI);
      expect(transports[0].checks).toBe(0);

      manager.setNetwork(CELLULAR);
      expect(transports[0].checks).toBe(1);
      expect(transports).toHaveLength(1);

      // Back from no network at all.
      manager.setNetwork(OFFLINE);
      manager.setNetwork(CELLULAR);
      expect(transports[0].checks).toBe(2);
    });

    it('leaves sessions that ended or never connected', () => {
      const { manager, transports, view } = setup();
      const ended = manager.start({ connectionId: 'box', name: 'Box', command: null });
      manager.attach(ended, view(), SIZE);
      transports[0].status({ state: 'connected' });
      transports[0].status({ state: 'closed', message: 'Session ended' });
      const unreachable = manager.start({ connectionId: 'box', name: 'Box', command: null });
      manager.attach(unreachable, view(), SIZE);
      transports[1].status({ state: 'closed', message: "Couldn't reach box", retry: true });

      manager.setNetwork(WIFI);
      manager.setNetwork(CELLULAR);

      expect(transports).toHaveLength(2);
    });
  });

  // An app lock set to forget its key on locking: saved passwords and keys are sealed then.
  describe('the vault’s key', () => {
    function dropped() {
      const env = setup();
      const id = env.manager.start({ connectionId: 'box', name: 'Claude', command: 'claude' });
      env.manager.attach(id, env.view(), SIZE);
      env.transports[0].status({ state: 'connected' });
      return { ...env, id };
    }

    it('keeps an open session running while it is forgotten', () => {
      const { manager, transports, session, id } = dropped();
      manager.setVaultOpen(false);

      expect(transports[0].closed).toBe(false);
      expect(session(id).status.state).toBe('connected');
    });

    it('waits for the unlock instead of retrying without a password or key', () => {
      const { manager, transports, timers, session, id } = dropped();
      manager.setVaultOpen(false);

      transports[0].status({ state: 'closed', message: 'Connection lost', retry: true });
      expect(timers).toHaveLength(0);
      expect(session(id)).toMatchObject({ reconnecting: true, waitingFor: 'unlock' });

      manager.setVaultOpen(true);
      expect(transports).toHaveLength(2);
      expect(session(id)).toMatchObject({ reconnecting: false, waitingFor: null });
    });

    it('stops a scheduled retry when it is forgotten', () => {
      const { manager, transports, timers, session, id } = dropped();
      transports[0].status({ state: 'closed', message: 'Connection lost', retry: true });

      manager.setVaultOpen(false);

      expect(timers[0].cancelled).toBe(true);
      expect(session(id)).toMatchObject({ reconnecting: true, waitingFor: 'unlock' });
      manager.setVaultOpen(true);
      expect(transports).toHaveLength(2);
    });

    it('waits for the unlock when the app comes back, or the network does', () => {
      const { manager, transports, timers, session, id } = dropped();
      manager.setNetwork({ online: false, kind: 'NONE' });
      transports[0].status({ state: 'closed', message: 'Connection lost', retry: true });
      manager.setVaultOpen(false);
      expect(session(id).waitingFor).toBe('network');

      manager.setNetwork({ online: true, kind: 'WIFI' });
      expect(session(id).waitingFor).toBe('unlock');
      manager.setAppActive(false);
      manager.setAppActive(true);
      expect(transports).toHaveLength(1);
      expect(timers).toHaveLength(0);

      manager.setVaultOpen(true);
      expect(transports).toHaveLength(2);
    });
  });

  it('cancels a scheduled reconnect when the session is closed', () => {
    const { manager, transports, timers, view } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Box', command: null });
    manager.attach(id, view(), SIZE);
    transports[0].status({ state: 'connected' });
    transports[0].status({ state: 'closed', message: 'Connection lost', retry: true });

    manager.close(id);

    expect(timers[0].cancelled).toBe(true);
  });

  it('turns the bell and notification sequences into attention when not watched', async () => {
    const { manager, transports, alerts, view, advance, session } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Claude · box', command: null });
    const sink = view();
    manager.attach(id, sink, SIZE);
    manager.setFocused(null);

    transports[0].output('\x07');
    await parsed(manager, id);
    expect(session(id).attention).toMatchObject({
      title: 'Claude · box',
      body: 'Needs your attention',
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].appActive).toBe(true);

    // More bells in the burst are quiet; a message replaces the bare bell, once.
    transports[0].output('\x07');
    await parsed(manager, id);
    expect(alerts).toHaveLength(1);
    transports[0].output('\x1b]9;Claude needs your permission to use Bash\x07');
    await parsed(manager, id);
    expect(session(id).attention?.body).toBe('Claude needs your permission to use Bash');
    expect(alerts).toHaveLength(2);

    // A bell that comes with the message doesn't replace it, and later messages in the
    // burst update the session without notifying again.
    transports[0].output('\x07');
    transports[0].output('\x1b]9;Still waiting\x07');
    await parsed(manager, id);
    expect(session(id).attention?.body).toBe('Still waiting');
    expect(alerts).toHaveLength(2);
    transports[0].output('\x07');
    await parsed(manager, id);
    expect(session(id).attention?.body).toBe('Still waiting');

    advance(20_000);
    manager.setAppActive(false);
    transports[0].output('\x1b]777;notify;Claude Code;Task finished\x07');
    await parsed(manager, id);
    expect(alerts.at(-1)).toMatchObject({
      attention: { title: 'Claude Code', body: 'Task finished' },
      appActive: false,
    });
  });

  it('ignores progress reports and stays quiet for the session on screen', async () => {
    const { manager, transports, alerts, view, session } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Box', command: null });
    manager.attach(id, view(), SIZE);

    transports[0].output('\x1b]9;4;1;50\x07');
    await parsed(manager, id);
    expect(session(id).attention).toBeNull();

    manager.setFocused(id);
    transports[0].output('\x07');
    await parsed(manager, id);
    expect(session(id).attention).toBeNull();
    expect(alerts).toHaveLength(0);
  });

  it('clears attention when the session is opened', async () => {
    const { manager, transports, view, session } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Box', command: null });
    const sink = view();
    manager.attach(id, sink, SIZE);
    manager.detach(id, sink);
    transports[0].output('\x07');
    await parsed(manager, id);
    expect(session(id).attention).not.toBeNull();

    manager.attach(id, view(), SIZE);
    expect(session(id).attention).toBeNull();
  });

  it('tracks the title the program sets and passes resizes through', async () => {
    const { manager, transports, view, session } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Box', command: null });
    manager.attach(id, view(), SIZE);

    transports[0].output('\x1b]0;vim notes.md\x07');
    await parsed(manager, id);
    manager.resize(id, { cols: 60, rows: 20 });

    expect(session(id).title).toBe('vim notes.md');
    expect(transports[0].resizes).toEqual([{ cols: 60, rows: 20 }]);
    expect(manager.screen(id)!.cols).toBe(60);
  });

  it('closes sessions and explains a deleted connection', () => {
    const { manager, transports, view, session } = setup({ connections: ['box'] });
    const kept = manager.start({ connectionId: 'box', name: 'Box', command: null });
    manager.attach(kept, view(), SIZE);
    manager.close(kept);
    expect(transports[0].closed).toBe(true);
    expect(manager.getSnapshot()).toHaveLength(0);

    const orphan = manager.start({ connectionId: 'gone', name: 'Gone', command: null });
    manager.attach(orphan, view(), SIZE);
    expect(session(orphan).status).toEqual({
      state: 'closed',
      message: 'This connection no longer exists',
    });
  });

  it('reads the last meaningful screen line and when the content last changed', async () => {
    const { manager, transports, view, advance } = setup();
    const id = manager.start({ connectionId: 'box', name: 'Box', command: null });
    manager.attach(id, view(), SIZE);
    const started = manager.activity(id)!.changedAt;

    advance(10_000);
    transports[0].output('Tests pass.\r\n\x1b[12;1H[main] 0:claude* 14:05');
    await parsed(manager, id);
    const first = manager.activity(id)!;
    expect(first.preview).toBe('Tests pass.');
    expect(first.changedAt).toBe(started + 10_000);

    // Only the tmux clock moves: the content hasn't changed.
    advance(10_000);
    transports[0].output('\x1b[12;1H[main] 0:claude* 14:06');
    await parsed(manager, id);
    expect(manager.activity(id)!.changedAt).toBe(first.changedAt);

    advance(10_000);
    transports[0].output('\x1b[2;1HDo you want to proceed?');
    await parsed(manager, id);
    expect(manager.activity(id)).toEqual({
      preview: 'Do you want to proceed?',
      changedAt: started + 30_000,
    });
    expect(manager.activity('nope')).toBeNull();
  });

  describe('prompts on screen', () => {
    const MENU = 'Do you want to proceed?\r\n\u276f 1. Yes\r\n  2. No (esc)\r\n';

    it('alerts for a question on screen, and drops the alert once it is answered', async () => {
      const { manager, transports, view, alerts, session } = setup();
      const id = manager.start({ connectionId: 'box', name: 'Claude', command: null });
      const sink = view();
      manager.attach(id, sink, SIZE);
      manager.detach(id, sink);

      transports[0].output(`Bash command\r\n  npm test\r\n${MENU}`);
      await parsed(manager, id);

      expect(session(id).prompt).toMatchObject({
        question: 'Do you want to proceed?',
        options: [
          { label: 'Yes', input: '1' },
          { label: 'No', input: '\x1b' },
        ],
      });
      expect(session(id).attention?.body).toBe('Do you want to proceed?');
      expect(alerts).toHaveLength(1);

      // Redrawn, not new: no second alert.
      transports[0].output(`\x1b[2J\x1b[H${MENU}`);
      await parsed(manager, id);
      expect(alerts).toHaveLength(1);

      // Answered on the laptop: the screen moves on.
      transports[0].output('\x1b[2J\x1b[H\u23fa Running npm test\r\n');
      await parsed(manager, id);
      expect(session(id).prompt).toBeNull();
      expect(session(id).attention).toBeNull();
    });

    it('keeps the agent’s own message, but replaces a bare bell', async () => {
      const { manager, transports, view, session } = setup();
      const id = manager.start({ connectionId: 'box', name: 'Claude', command: null });
      const sink = view();
      manager.attach(id, sink, SIZE);
      manager.detach(id, sink);

      transports[0].output(`\x1b]9;Claude needs your permission to use Bash\x07${MENU}`);
      await parsed(manager, id);
      expect(session(id).attention?.body).toBe('Claude needs your permission to use Bash');

      const other = manager.start({ connectionId: 'box', name: 'Shell', command: null });
      manager.attach(other, sink, SIZE);
      manager.detach(other, sink);
      transports[1].output('\x07Continue? [y/N] ');
      await parsed(manager, other);
      expect(session(other).attention?.body).toBe('Continue?');
    });

    it('notes the question but stays quiet for the session on screen', async () => {
      const { manager, transports, view, alerts, session } = setup();
      const id = manager.start({ connectionId: 'box', name: 'Claude', command: null });
      manager.attach(id, view(), SIZE);
      manager.setFocused(id);

      transports[0].output(MENU);
      await parsed(manager, id);

      expect(session(id).prompt?.question).toBe('Do you want to proceed?');
      expect(session(id).attention).toBeNull();
      expect(alerts).toHaveLength(0);
    });

    it('sends the question with the agent’s own message, in one notification', async () => {
      const { manager, transports, view, alerts } = setup();
      const id = manager.start({ connectionId: 'box', name: 'Claude', command: null });
      const sink = view();
      manager.attach(id, sink, SIZE);
      manager.detach(id, sink);

      transports[0].output(`\x1b]9;Claude needs your permission to use Bash\x07${MENU}`);
      await parsed(manager, id);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].attention.body).toBe('Claude needs your permission to use Bash');
      expect(alerts[0].session.prompt?.question).toBe('Do you want to proceed?');
    });
  });

  describe('answers', () => {
    const MENU = 'Do you want to proceed?\r\n\u276f 1. Yes\r\n  2. No (esc)\r\n';

    async function asked() {
      const context = setup();
      const { manager, transports, view, session } = context;
      const id = manager.start({ connectionId: 'box', name: 'Claude', command: null });
      const sink = view();
      manager.attach(id, sink, SIZE);
      manager.detach(id, sink);
      transports[0].status({ state: 'connected' });
      transports[0].output(MENU);
      await parsed(manager, id);
      return { ...context, id, at: session(id).prompt!.at };
    }

    it('types the answer into the question it was meant for, once', async () => {
      const { manager, transports, session, id, at } = await asked();

      expect(manager.answer(id, at, 'deny')).toBe('sent');
      expect(transports[0].written).toEqual(['\x1b']);
      expect(session(id).attention).toBeNull();
      expect(session(id).prompt?.answered).toBe(true);

      expect(manager.answer(id, at, 'approve')).toBe('gone');
      expect(transports[0].written).toEqual(['\x1b']);
    });

    it('never types into a screen that moved on', async () => {
      const { manager, transports, id, at } = await asked();
      transports[0].output('\x1b[2J\x1b[H$ ');
      await parsed(manager, id);

      expect(manager.answer(id, at, 'approve')).toBe('gone');
      expect(manager.answer('nope', at, 'approve')).toBe('gone');
      expect(transports[0].written).toEqual([]);
    });

    it('says when the session is disconnected', async () => {
      const { manager, transports, id, at } = await asked();
      transports[0].status({ state: 'closed', message: 'gone' });

      expect(manager.answer(id, at, 'approve')).toBe('disconnected');
    });
  });

  describe('agents that finish', () => {
    const SPINNER = (s: number) =>
      `\x1b[2J\x1b[H\u273b Pondering\u2026 (${s}s \u00b7 esc to interrupt)\r\n`;

    async function working() {
      const context = setup();
      const { manager, transports, view } = context;
      const id = manager.start({ connectionId: 'box', name: 'Claude', command: null });
      const sink = view();
      manager.attach(id, sink, SIZE);
      manager.detach(id, sink);
      transports[0].output(SPINNER(1));
      await parsed(manager, id);
      return { ...context, id };
    }

    it('says so once the working line has stayed gone', async () => {
      const { manager, transports, timers, alerts, session, id } = await working();
      expect(timers.filter((timer) => timer.ms === FINISH_SETTLE_MS)).toHaveLength(0);

      transports[0].output('\x1b[2J\x1b[H\u23fa All 41 tests pass.\r\n');
      await parsed(manager, id);
      const settle = timers.find((timer) => timer.ms === FINISH_SETTLE_MS)!;
      expect(alerts).toHaveLength(0);

      settle.run();
      expect(session(id).attention).toMatchObject({
        kind: 'finished',
        title: 'Claude finished',
        body: 'All 41 tests pass.',
      });
      expect(alerts).toHaveLength(1);
    });

    it('ignores a working line that comes back (a redraw between steps)', async () => {
      const { manager, transports, timers, alerts, session, id } = await working();

      transports[0].output('\x1b[2J\x1b[H');
      await parsed(manager, id);
      transports[0].output(SPINNER(2));
      await parsed(manager, id);

      const settle = timers.find((timer) => timer.ms === FINISH_SETTLE_MS)!;
      expect(settle.cancelled).toBe(true);
      expect(session(id).attention).toBeNull();
      expect(alerts).toHaveLength(0);
    });

    it('asks rather than finishes when a question replaces the working line', async () => {
      const { manager, transports, timers, session, id } = await working();

      transports[0].output('\x1b[2J\x1b[HDo you want to proceed?\r\n\u276f 1. Yes\r\n  2. No\r\n');
      await parsed(manager, id);

      expect(session(id).attention?.kind).toBe('question');
      expect(session(id).workingSince).toBeNull();
      expect(timers.some((timer) => timer.ms === FINISH_SETTLE_MS && !timer.cancelled)).toBe(false);
    });

    it('knows since when the agent has been working, until it stops', async () => {
      const { manager, transports, timers, session, id, advance } = await working();
      expect(session(id).workingSince).toBe(1_000_000);

      advance(65_000);
      transports[0].output(SPINNER(66));
      await parsed(manager, id);
      expect(session(id).workingSince).toBe(1_000_000);

      transports[0].output('\x1b[2J\x1b[H\u23fa Done.\r\n');
      await parsed(manager, id);
      // Not until it has stayed gone.
      expect(session(id).workingSince).toBe(1_000_000);
      timers.find((timer) => timer.ms === FINISH_SETTLE_MS)!.run();
      expect(session(id).workingSince).toBeNull();
    });
  });

  describe('while you were away', () => {
    const numbered = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => `line ${from + i}\r\n`).join('');

    /** A session on screen, as useSessionView shows it, that has written `text`. */
    async function watching(text = numbered(0, 5)) {
      const harness = setup();
      const { manager, transports, view } = harness;
      const id = manager.start({ connectionId: 'box', name: 'Box', command: null });
      let sink = view();
      manager.setFocused(id);
      manager.attach(id, sink, SIZE);
      transports[0].status({ state: 'connected' });
      transports[0].output(text);
      await parsed(manager, id);
      return {
        ...harness,
        id,
        leave() {
          manager.detach(id, sink);
          manager.setFocused(null);
        },
        /** Opens the session again; resolves once it has said what arrived. */
        async comeBack() {
          sink = view();
          manager.setFocused(id);
          manager.attach(id, sink, SIZE);
          await parsed(manager, id);
        },
      };
    }

    it('counts the lines that scrolled past while the person looked elsewhere', async () => {
      const { manager, transports, advance, session, id, leave, comeBack } = await watching();

      leave();
      advance(60_000);
      transports[0].output(numbered(5, 40));
      await comeBack();

      expect(session(id).away).toEqual({
        since: 1_000_000,
        lines: 40,
        more: false,
        screen: [...Array.from({ length: 5 }, (_, i) => `line ${i}`), ...Array(7).fill('')],
      });
      // Back up to where they left off (line 5), two lines early: 31 above the bottom screen.
      expect(manager.awayScroll(id)).toBe(31);
      const buffer = manager.screen(id)!.buffer.active;
      expect(buffer.getLine(buffer.baseY - 31)?.translateToString(true)).toBe('line 3');

      manager.dismissAway(id);
      expect(session(id).away).toBeNull();
      expect(manager.awayScroll(id)).toBeNull();
    });

    it('says nothing after a short look elsewhere, or when the new lines are all in view', async () => {
      const { transports, advance, session, id, leave, comeBack } = await watching();

      leave();
      advance(5_000);
      transports[0].output(numbered(5, 40));
      await comeBack();
      expect(session(id).away).toBeNull();

      leave();
      advance(60_000);
      transports[0].output(numbered(45, 3));
      await comeBack();
      expect(session(id).away).toBeNull();
    });

    it('counts time in another app as away', async () => {
      const { manager, transports, advance, session, id } = await watching();

      manager.setAppActive(false);
      advance(60_000);
      transports[0].output(numbered(5, 40));
      manager.setAppActive(true);
      await parsed(manager, id);

      expect(session(id).away?.lines).toBe(40);
    });

    it('forgets it when the person leaves again', async () => {
      const { transports, advance, session, id, leave, comeBack } = await watching();
      leave();
      advance(60_000);
      transports[0].output(numbered(5, 40));
      await comeBack();
      expect(session(id).away).not.toBeNull();

      leave();

      expect(session(id).away).toBeNull();
    });

    it('jumps to the oldest line kept when the place has left the scrollback', async () => {
      const { manager, transports, advance, session, id, leave, comeBack } = await watching();

      leave();
      advance(60_000);
      transports[0].output(numbered(5, 5100));
      await comeBack();

      expect(session(id).away).toMatchObject({ lines: 5011, more: true });
      expect(manager.awayScroll(id)).toBe(manager.screen(id)!.buffer.active.baseY);
    });

    it('notices a full-screen program drawing something new, but not its clock', async () => {
      const screen = (body: string, time: string) =>
        `\x1b[H\x1b[2J${body}\x1b[12;1H[Janus] 0:claude*  "devbox" ${time}`;
      const { manager, transports, advance, session, id, leave, comeBack } = await watching(
        `\x1b[?1049h${screen('Working on the failing test', '14:05')}`
      );

      leave();
      advance(60_000);
      transports[0].output(screen('Working on the failing test', '14:06'));
      await comeBack();
      expect(session(id).away).toBeNull();

      leave();
      advance(60_000);
      transports[0].output(screen('All 41 tests pass.', '14:07'));
      await comeBack();
      const away = session(id).away!;
      expect(away.lines).toBeNull();
      expect(away.screen[0]).toBe('Working on the failing test');
      // tmux keeps the lines: reading mode finds them, not a jump.
      expect(manager.awayScroll(id)).toBeNull();
    });
  });
});
