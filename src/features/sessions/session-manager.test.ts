/**
 * @jest-environment node
 */
import type {
  SessionStatus,
  TerminalSize,
  TerminalTransport,
  TransportListener,
} from '@/features/terminal/transport';

import { SessionManager, type Attention, type SessionSnapshot } from './session-manager';

class FakeTransport implements TerminalTransport {
  size: TerminalSize | null = null;
  written: string[] = [];
  resizes: TerminalSize[] = [];
  closed = false;
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
});
