import { SerializeAddon } from '@xterm/addon-serialize';
import { Terminal, type HeadlessTerminal } from './headless-terminal';

import type {
  InputMode,
  SessionStatus,
  TerminalSize,
  TerminalTransport,
  TransportListener,
  Tunnel,
  TunnelEvents,
} from '@/features/terminal/transport';

import { parseOsc777, parseOsc9, parseOsc99, type AgentAlert } from './alerts';
import { contentLines, lastMeaningfulLine, type SessionActivity } from './inbox';
import {
  answersFor,
  detectPrompt,
  isWorking,
  samePrompt,
  type DetectedPrompt,
  type PromptAnswer,
} from './prompts';

/**
 * Open terminal sessions, kept alive while the person looks elsewhere (another session,
 * the home screen). Each session keeps a headless xterm.js copy of its screen, so a view
 * that attaches later is redrawn exactly, and so alerts (the bell, notification escape
 * sequences) are noticed even when no view is showing the session.
 */

export type SessionTarget = {
  connectionId: string;
  /** Shown in lists and notifications: the shortcut's or the connection's name. */
  name: string;
  /** Typed into the shell once connected (and again after a reconnect). */
  command: string | null;
};

/**
 * Why a session wants the person: a message (the bell, a notification escape code), a
 * question on its screen, or an agent that stopped working without asking anything.
 */
export type AttentionKind = 'message' | 'question' | 'finished';

export type Attention = { title: string; body: string; at: number; kind: AttentionKind };

/** A question on the session's screen, waiting for an answer (see prompts.ts). */
export type AgentPrompt = DetectedPrompt & {
  at: number;
  /** Answered from the app; it stays until the screen moves on, but can't be answered twice. */
  answered?: boolean;
};

/** What became of an answer sent from a notification or the inbox. */
export type AnswerResult = 'sent' | 'gone' | 'disconnected';

export type SessionSnapshot = SessionTarget & {
  id: string;
  status: SessionStatus;
  /** The window title the shell or program set, if any. */
  title: string | null;
  inputMode: InputMode;
  /** An alert the person hasn't seen yet. Cleared when they open the session. */
  attention: Attention | null;
  /** A question on screen that waits for the person, until it leaves the screen. */
  prompt: AgentPrompt | null;
  /** The connection dropped and a reconnect is scheduled. */
  reconnecting: boolean;
};

/** Where a session's output goes while a terminal view shows it. */
export type ViewSink = {
  write(data: string): void;
  /** Clears the view before the session's screen is replayed into it. */
  reset(): void;
};

/** A transport for the connection, or null when it no longer exists. */
export type TransportOpener = (
  connectionId: string,
  listener: TransportListener
) => TerminalTransport | null;

export type SessionManagerDeps = {
  openTransport: TransportOpener;
  /** Called for alerts from sessions the person isn't looking at. */
  onAttention(session: SessionSnapshot, attention: Attention, appActive: boolean): void;
  now?: () => number;
  /** Runs `callback` after `ms`; returns a cancel function. Defaults to setTimeout. */
  delay?: (callback: () => void, ms: number) => () => void;
};

const SCROLLBACK = 5000;
const REPLAY_SCROLLBACK = 2000;
/** Bells come in bursts (tab completion); notify at most this often per session. */
const ALERT_INTERVAL_MS = 15_000;
/**
 * An agent's working line (its spinner) must stay gone this long before it counts as
 * finished, so a redraw between two steps doesn't.
 */
export const FINISH_SETTLE_MS = 2_000;
/**
 * When a session that was connected loses its connection, it reconnects after each of these
 * delays in turn (its command, e.g. `tmux new -A`, reattaches). After that it waits for the
 * person, or for the app to come back on screen, when it tries again.
 */
export const RECONNECT_DELAYS_MS = [1_000, 5_000, 15_000];

class Session {
  readonly headless: HeadlessTerminal;
  private readonly serializer = new SerializeAddon();
  private transport: TerminalTransport | null = null;
  private view: ViewSink | null = null;
  private replayBuffer: string[] | null = null;
  private size: TerminalSize = { cols: 80, rows: 24 };
  private lastAlertAt = -Infinity;
  private lastAlertWasBell = false;
  private everConnected = false;
  private retries = 0;
  private cancelRetry: (() => void) | null = null;
  private lastOutputAt: number;
  private screenText = '';
  private changedAt: number;
  private writes = 0;
  private closed = false;
  /** An agent's working line was on screen at the last look. */
  private working = false;
  private cancelFinish: (() => void) | null = null;
  /** An alert to notify once the burst of output that raised it has been read. */
  private notifyPending = false;
  snapshot: SessionSnapshot;

  constructor(
    id: string,
    target: SessionTarget,
    private readonly manager: SessionManager
  ) {
    this.snapshot = {
      ...target,
      id,
      status: { state: 'connecting' },
      title: null,
      inputMode: 'normal',
      attention: null,
      prompt: null,
      reconnecting: false,
    };
    this.lastOutputAt = this.changedAt = manager.now();
    this.headless = new Terminal({
      cols: 80,
      rows: 24,
      scrollback: SCROLLBACK,
      allowProposedApi: true,
    });
    this.headless.loadAddon(this.serializer);
    this.headless.onBell(() =>
      this.alert({ title: null, body: 'Needs your attention' }, 'message', { bell: true })
    );
    this.headless.onTitleChange((title) => this.update({ title }));
    const handlers: [number, (data: string) => AgentAlert | null][] = [
      [9, parseOsc9],
      [777, parseOsc777],
      [99, parseOsc99],
    ];
    for (const [ident, parse] of handlers) {
      this.headless.parser.registerOscHandler(ident, (data) => {
        const alert = parse(data);
        if (alert) this.alert(alert, 'message');
        return true;
      });
    }
  }

  private update(changes: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...changes };
    this.manager.changed();
  }

  private alert(
    { title, body }: AgentAlert,
    kind: AttentionKind,
    { bell = false, now = this.manager.now() } = {}
  ) {
    const watching = this.manager.isWatching(this.snapshot.id);
    if (watching) return;
    const recent = now - this.lastAlertAt < ALERT_INTERVAL_MS;
    // Agents can ring the bell with a message (Claude Code's iterm2_with_bell): the bell
    // adds nothing to the message, and the message is worth a notification of its own.
    if (bell && recent && this.snapshot.attention) return;
    const attention = { title: title ?? this.snapshot.name, body, at: now, kind };
    this.update({ attention });
    if (recent && (bell || !this.lastAlertWasBell)) return;
    this.lastAlertAt = now;
    this.lastAlertWasBell = bell;
    // Sent once the screen has been read, so it can carry a question drawn in the same burst.
    this.notifyPending = true;
  }

  private flushNotification() {
    if (!this.notifyPending) return;
    this.notifyPending = false;
    if (this.snapshot.attention) this.manager.attention(this.snapshot, this.snapshot.attention);
  }

  private output(text: string) {
    this.lastOutputAt = this.manager.now();
    // Look for a prompt once the screen has settled: after the last write of a burst.
    const write = ++this.writes;
    this.headless.write(text, () => {
      if (write !== this.writes) return;
      this.checkScreen();
      this.flushNotification();
    });
    if (this.view) this.view.write(text);
    else this.replayBuffer?.push(text);
  }

  attach(view: ViewSink, size: TerminalSize) {
    this.view = null;
    this.resize(size);
    if (this.snapshot.attention) this.update({ attention: null });
    if (!this.transport) {
      this.view = view;
      this.connect();
      return;
    }
    // Replay once the headless copy has parsed everything received so far; output
    // that arrives meanwhile is held so it lands after the replay, in order.
    const buffer: string[] = [];
    this.replayBuffer = buffer;
    this.headless.write('', () => {
      if (this.replayBuffer !== buffer) return;
      this.replayBuffer = null;
      view.reset();
      view.write(this.serializer.serialize({ scrollback: REPLAY_SCROLLBACK }));
      buffer.forEach((text) => view.write(text));
      this.view = view;
    });
  }

  /**
   * What's on screen now. Checked when asked (the inbox asks every second) rather than on
   * every write: if the content changed since the last look, it changed by the last output.
   * Chrome such as a status bar's clock doesn't count, so it can't make a session look busy.
   */
  activity(): SessionActivity {
    const content = contentLines(this.screenLines());
    const text = content.join('\n');
    if (text !== this.screenText) {
      this.screenText = text;
      this.changedAt = this.lastOutputAt;
    }
    return { preview: content.at(-1) ?? null, changedAt: this.changedAt };
  }

  /**
   * The lines on screen now, top to bottom. A line the terminal wrapped because the screen
   * is narrow comes back whole.
   */
  private screenLines(): string[] {
    const buffer = this.headless.buffer.active;
    const lines: string[] = [];
    for (let y = buffer.baseY; y < buffer.baseY + this.headless.rows; y++) {
      const line = buffer.getLine(y);
      const text = line?.translateToString(true) ?? '';
      if (line?.isWrapped && lines.length) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    return lines;
  }

  /** The last `limit` lines of the screen and its scrollback, wrapped lines joined. */
  recentText(limit: number): string {
    const buffer = this.headless.buffer.active;
    const end = buffer.baseY + this.headless.rows;
    const lines: string[] = [];
    for (let y = Math.max(0, end - limit); y < end; y++) {
      const line = buffer.getLine(y);
      const text = line?.translateToString(true) ?? '';
      if (line?.isWrapped && lines.length) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    return lines.join('\n');
  }

  /** Reads the screen after a burst of output: questions, and agents starting or stopping. */
  private checkScreen() {
    if (this.closed) return;
    const lines = this.screenLines();
    this.checkPrompt(lines);
    if (this.snapshot.prompt) {
      // Asking, not finished: the question is the alert.
      this.working = false;
      this.stopFinishTimer();
    } else if (isWorking(lines)) {
      this.working = true;
      this.stopFinishTimer();
    } else if (this.working && !this.cancelFinish) {
      this.cancelFinish = this.manager.delay(() => {
        this.cancelFinish = null;
        this.finish();
      }, FINISH_SETTLE_MS);
    }
  }

  private stopFinishTimer() {
    this.cancelFinish?.();
    this.cancelFinish = null;
  }

  /**
   * Notices a question on screen (an agent's approval menu, a `[y/N]`) and treats it like an
   * alert, for agents and programs that don't ring the bell. When it leaves the screen
   * (answered here or elsewhere) the alert it raised goes too.
   */
  private checkPrompt(lines: string[]) {
    const detected = detectPrompt(lines);
    const current = this.snapshot.prompt;
    if (!detected) {
      if (!current) return;
      const raised = this.snapshot.attention?.at === current.at;
      this.update({ prompt: null, ...(raised ? { attention: null } : {}) });
      return;
    }
    if (current && samePrompt(current, detected)) return;
    const prompt = { ...detected, at: this.manager.now() };
    this.update({ prompt });
    const { attention } = this.snapshot;
    if (!attention || this.lastAlertWasBell || attention.kind === 'finished') {
      // At the prompt's time, so the alert can be matched to it when the prompt goes.
      this.alert({ title: null, body: prompt.question }, 'question', { now: prompt.at });
    } else if (!this.manager.isWatching(this.snapshot.id)) {
      // A message the agent sent itself ("needs your permission to use Bash") says more than
      // the question, so it stays; its notification is sent again to carry the answers.
      this.notifyPending = true;
    }
  }

  /**
   * The agent's working line has stayed gone without a question in its place: it stopped
   * by itself. Says so, with the last line it wrote.
   */
  private finish() {
    if (this.closed) return;
    const lines = this.screenLines();
    if (isWorking(lines) || this.snapshot.prompt) return;
    this.working = false;
    this.alert(
      { title: `${this.snapshot.name} finished`, body: lastMeaningfulLine(lines) ?? 'Done' },
      'finished'
    );
    this.flushNotification();
  }

  /**
   * Answers the question on screen, if it's still the one the person saw (`at`): never
   * types into whatever replaced it.
   */
  answer(at: number, choice: PromptAnswer): AnswerResult {
    const { prompt, status } = this.snapshot;
    const answers = prompt && !prompt.answered && prompt.at === at ? answersFor(prompt) : null;
    if (!prompt || !answers) return 'gone';
    if (!this.transport || status.state !== 'connected') return 'disconnected';
    this.transport.write(answers[choice]);
    const raised = this.snapshot.attention?.at === prompt.at;
    this.update({ prompt: { ...prompt, answered: true }, ...(raised ? { attention: null } : {}) });
    return 'sent';
  }

  detach(view: ViewSink) {
    if (this.view === view) this.view = null;
    this.replayBuffer = null;
  }

  write(data: string) {
    this.transport?.write(data);
  }

  resize(size: TerminalSize) {
    if (size.cols === this.size.cols && size.rows === this.size.rows) return;
    this.size = size;
    this.headless.resize(size.cols, size.rows);
    this.transport?.resize(size);
  }

  /** A tunnel through the session's current connection (it changes on a reconnect). */
  openTunnel(port: number, events: TunnelEvents): Promise<Tunnel> {
    if (this.snapshot.status.state !== 'connected' || !this.transport?.openTunnel) {
      return Promise.reject(new Error('Not connected'));
    }
    return this.transport.openTunnel(port, events);
  }

  /** Reconnects now, e.g. from the Reconnect button: a fresh run of retries if it fails. */
  reconnect() {
    this.retries = 0;
    this.retryNow();
  }

  /** The app is back on screen: reconnect if the connection was lost while it was away. */
  resume() {
    const { status } = this.snapshot;
    if (status.state === 'closed' && status.retry && this.everConnected && !this.cancelRetry) {
      this.reconnect();
    }
  }

  private retryNow() {
    this.cancelRetry?.();
    this.cancelRetry = null;
    if (this.snapshot.reconnecting) this.update({ reconnecting: false });
    this.output('\r\n');
    this.connect();
  }

  private scheduleRetry(status: SessionStatus) {
    if (status.state !== 'closed' || !status.retry || !this.everConnected) return;
    const delay = RECONNECT_DELAYS_MS[this.retries];
    if (delay === undefined) return;
    this.retries++;
    this.update({ reconnecting: true });
    this.cancelRetry = this.manager.delay(() => {
      this.cancelRetry = null;
      this.retryNow();
    }, delay);
  }

  connect() {
    this.transport?.close();
    let sentCommand = false;
    const isCurrent = () => this.transport === transport;
    const transport = this.manager.openTransport(this.snapshot.connectionId, {
      onData: (text) => {
        if (isCurrent()) this.output(text);
      },
      onTitle: (title) => {
        if (isCurrent()) this.update({ title });
      },
      onInputMode: (inputMode) => {
        if (isCurrent()) this.update({ inputMode });
      },
      onStatus: (status) => {
        if (!isCurrent()) return;
        this.update({ status, inputMode: 'normal' });
        if (status.state === 'connected') {
          this.everConnected = true;
          this.retries = 0;
        }
        this.scheduleRetry(status);
        const { command } = this.snapshot;
        if (status.state === 'connected' && command && !sentCommand) {
          sentCommand = true;
          transport?.write(`${command}\r`);
        }
      },
    });
    this.transport = transport;
    if (!transport) {
      this.update({ status: { state: 'closed', message: 'This connection no longer exists' } });
      return;
    }
    transport.connect(this.size);
  }

  close() {
    this.closed = true;
    this.stopFinishTimer();
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.transport?.close();
    this.transport = null;
    this.view = null;
    this.headless.dispose();
  }
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private snapshots: SessionSnapshot[] = [];
  private listeners = new Set<() => void>();
  private focusedId: string | null = null;
  private appActive = true;
  private counter = 0;

  constructor(private deps: SessionManagerDeps) {}

  /** Swaps how transports are opened, e.g. when the saved connections change. */
  setTransportOpener(openTransport: TransportOpener) {
    this.deps = { ...this.deps, openTransport };
  }

  /** Swaps what happens on alerts, e.g. when which connections are protected changes. */
  setAttentionHandler(onAttention: SessionManagerDeps['onAttention']) {
    this.deps = { ...this.deps, onAttention };
  }

  /** @internal */
  openTransport(connectionId: string, listener: TransportListener) {
    return this.deps.openTransport(connectionId, listener);
  }

  // ───────── store interface (useSyncExternalStore) ─────────

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshots;

  /** @internal */
  changed() {
    this.snapshots = [...this.sessions.values()].map((session) => session.snapshot);
    this.listeners.forEach((listener) => listener());
  }

  // ───────── sessions ─────────

  /** Creates a session; it connects when a view first attaches (so it knows its size). */
  start(target: SessionTarget): string {
    const id = `s${++this.counter}-${Math.random().toString(36).slice(2, 7)}`;
    this.sessions.set(id, new Session(id, target, this));
    this.changed();
    return id;
  }

  has(id: string) {
    return this.sessions.has(id);
  }

  attach(id: string, view: ViewSink, size: TerminalSize) {
    this.sessions.get(id)?.attach(view, size);
  }

  detach(id: string, view: ViewSink) {
    this.sessions.get(id)?.detach(view);
  }

  write(id: string, data: string) {
    this.sessions.get(id)?.write(data);
  }

  resize(id: string, size: TerminalSize) {
    this.sessions.get(id)?.resize(size);
  }

  /** Answers a session's question (see Session.answer); 'gone' for a closed session. */
  answer(id: string, at: number, choice: PromptAnswer): AnswerResult {
    return this.sessions.get(id)?.answer(at, choice) ?? 'gone';
  }

  reconnect(id: string) {
    this.sessions.get(id)?.reconnect();
  }

  /** Opens a tunnel to `port` on the session's host (see TerminalTransport.openTunnel). */
  openTunnel(id: string, port: number, events: TunnelEvents): Promise<Tunnel> {
    return (
      this.sessions.get(id)?.openTunnel(port, events) ??
      Promise.reject(new Error('The session was closed'))
    );
  }

  close(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.close();
    this.sessions.delete(id);
    if (this.focusedId === id) this.focusedId = null;
    this.changed();
  }

  /** What a session's screen shows, for the inbox; null for a closed session. */
  activity(id: string): SessionActivity | null {
    return this.sessions.get(id)?.activity() ?? null;
  }

  /** The end of a session's output as text (its screen and recent scrollback). */
  recentText(id: string, limit = 1000): string {
    return this.sessions.get(id)?.recentText(limit) ?? '';
  }

  /** The headless copy of a session's screen (tests, previews). */
  screen(id: string): HeadlessTerminal | null {
    return this.sessions.get(id)?.headless ?? null;
  }

  // ───────── what the person is looking at ─────────

  /** The session on screen, or null. Alerts from it don't notify. */
  setFocused(id: string | null) {
    this.focusedId = id;
  }

  setAppActive(active: boolean) {
    this.appActive = active;
    if (active) this.sessions.forEach((session) => session.resume());
  }

  /** @internal */
  isWatching(id: string) {
    return this.appActive && this.focusedId === id;
  }

  /** @internal */
  attention(session: SessionSnapshot, attention: Attention) {
    this.deps.onAttention(session, attention, this.appActive);
  }

  /** @internal */
  now() {
    return (this.deps.now ?? Date.now)();
  }

  /** @internal */
  delay(callback: () => void, ms: number): () => void {
    if (this.deps.delay) return this.deps.delay(callback, ms);
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  }

  closeAll() {
    [...this.sessions.keys()].forEach((id) => this.close(id));
  }
}
