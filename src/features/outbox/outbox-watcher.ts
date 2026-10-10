import type { Connection } from '@/features/connections/connections';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import type { Tunnel, TunnelEvents } from '@/features/terminal/transport';

import {
  isSettled,
  listingReader,
  MAX_FILE_BYTES,
  readOutput,
  readScript,
  WATCH_SCRIPT,
  type HostFile,
  type Listing,
} from './outbox';
import { KEEP_FILES, type OutboxFile, type OutboxStore } from './outbox-store';

/**
 * The commands, named so `ps` on the host (and a test) tells them from the health strip's
 * `sh -s`. The word is only sh's `$1`; the scripts go in on stdin, so the login shell (fish,
 * csh) never parses them.
 */
export const WATCH_COMMAND = 'sh -s flare-outbox';
export const READ_COMMAND = 'sh -s flare-outbox-read';

/** Runs a command on a session's host (SessionManager.runCommand). */
export type RunCommand = (
  sessionId: string,
  command: string,
  events: TunnelEvents
) => Promise<Tunnel>;

/** A host to watch, through one of its connected sessions. */
export type WatchTarget = { connectionId: string; sessionId: string; host: string };

/** One connected SSH session for each connection that has one. */
export function watchTargets(
  sessions: SessionSnapshot[],
  connections: Connection[]
): WatchTarget[] {
  const targets = new Map<string, WatchTarget>();
  for (const session of sessions) {
    if (session.status.state !== 'connected' || targets.has(session.connectionId)) continue;
    const connection = connections.find(({ id }) => id === session.connectionId);
    if (connection?.kind !== 'ssh') continue;
    targets.set(connection.id, {
      connectionId: connection.id,
      sessionId: session.id,
      host: connection.name,
    });
  }
  return [...targets.values()];
}

/** How long reading a file may take: a minute, and 20 s more per MB. */
export function readTimeout(size: number): number {
  return 60_000 + Math.ceil(size / 1_000_000) * 20_000;
}

type Deps = {
  run: RunCommand;
  store: OutboxStore;
  now?: () => number;
};

/** The files that came over in one look at a host's folder, newest first. */
export type ArrivalHandler = (files: OutboxFile[]) => void;

/** Watches each host's outbox through one of its connected SSH sessions. */
export class OutboxWatchers {
  private watchers = new Map<string, Watcher>();
  private onArrived: ArrivalHandler = () => {};

  constructor(private readonly deps: Deps) {}

  setArrivalHandler(onArrived: ArrivalHandler) {
    this.onArrived = onArrived;
  }

  /**
   * The hosts to watch now. A watcher whose session left (or changed) stops; one whose
   * command ended on its own stays stopped until its session reconnects, so a host that
   * won't run commands isn't asked again and again.
   */
  update(targets: WatchTarget[]) {
    const wanted = new Map(targets.map((target) => [target.connectionId, target]));
    for (const [connectionId, watcher] of this.watchers) {
      if (wanted.get(connectionId)?.sessionId === watcher.target.sessionId) continue;
      watcher.stop();
      this.watchers.delete(connectionId);
    }
    for (const target of targets) {
      if (this.watchers.has(target.connectionId)) continue;
      const watcher = new Watcher(target, this.deps, (files) => this.onArrived(files));
      this.watchers.set(target.connectionId, watcher);
      watcher.start();
    }
  }

  stopAll() {
    this.update([]);
  }
}

class Watcher {
  private ended = false;
  private command: Tunnel | null = null;
  /** The newest version of each file to fetch, in the order to fetch them. */
  private queue = new Map<string, HostFile>();
  private fetching = false;
  private stopRead: (() => void) | null = null;

  constructor(
    readonly target: WatchTarget,
    private readonly deps: Deps,
    private readonly onArrived: ArrivalHandler
  ) {}

  start() {
    const decoder = new TextDecoder();
    const read = listingReader((listing) => this.look(listing));
    this.deps
      .run(this.target.sessionId, WATCH_COMMAND, {
        onData: (bytes) => read(decoder.decode(bytes, { stream: true })),
        onClose: () => this.stop(),
      })
      .then(
        (opened) => {
          if (this.ended) return opened.close();
          this.command = opened;
          opened.write(new TextEncoder().encode(WATCH_SCRIPT));
        },
        // A host that won't run commands has no outbox.
        () => this.stop()
      );
  }

  stop() {
    if (this.ended) return;
    this.ended = true;
    this.command?.close();
    this.stopRead?.();
  }

  /** One listing of the folder: fetch what's new and finished. */
  private look({ now, files }: Listing) {
    const { store } = this.deps;
    const { connectionId } = this.target;
    store.keepSeen(connectionId, files);
    const fresh = files
      .filter((file) => store.isNew(connectionId, file) && isSettled(file, now))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
    // Past the most the phone keeps, older files would only push newer ones out: they stay
    // on the host. The rest come oldest first, so the newest ends up on top.
    store.markSeen(connectionId, fresh.slice(KEEP_FILES));
    fresh.splice(KEEP_FILES);
    fresh.reverse();
    for (const file of fresh) this.queue.set(file.name, file);
    void this.fetchAll();
  }

  /** Fetches the queue one file at a time, then reports what came. */
  private async fetchAll() {
    if (this.fetching) return;
    this.fetching = true;
    const { store, now = Date.now } = this.deps;
    const { connectionId, host } = this.target;
    const arrived: OutboxFile[] = [];
    while (!this.ended && this.queue.size) {
      const [name, file] = this.queue.entries().next().value!;
      this.queue.delete(name);
      if (!store.isNew(connectionId, file)) continue;
      try {
        const text = file.size > MAX_FILE_BYTES ? null : await this.read(file);
        // Gone before it could be read: the next listing says whether it's back.
        if (text === undefined || this.ended) continue;
        arrived.push(store.receive(connectionId, host, file, text, now()));
      } catch {
        // The next listing tries again.
      }
    }
    this.fetching = false;
    if (arrived.length) this.onArrived(arrived.reverse());
  }

  /** The file's text; null if it grew past the limit; undefined if it's gone. */
  private read(file: HostFile): Promise<string | null | undefined> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let total = 0;
      let opened: Tunnel | null = null;
      let done = false;
      const finish = (settle: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.stopRead = null;
        opened?.close();
        settle();
      };
      const timer = setTimeout(
        () => finish(() => reject(new Error('The host stopped answering'))),
        readTimeout(file.size)
      );
      this.stopRead = () => finish(() => reject(new Error('Stopped')));
      this.deps
        .run(this.target.sessionId, READ_COMMAND, {
          onData: (bytes) => {
            total += bytes.length;
            // It grew since the listing: too big after all.
            if (total > MAX_FILE_BYTES + 64) finish(() => resolve(null));
            else chunks.push(bytes);
          },
          onClose: () =>
            finish(() => {
              const bytes = new Uint8Array(total);
              let offset = 0;
              for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.length;
              }
              resolve(readOutput(bytes) ?? undefined);
            }),
        })
        .then(
          (command) => {
            if (done) return command.close();
            opened = command;
            command.write(new TextEncoder().encode(readScript(file.name)));
          },
          (error: unknown) => finish(() => reject(error))
        );
    });
  }
}
