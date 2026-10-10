import { readJson, removeJson, writeJson } from '@/lib/storage';

import { kindOf, versionOf, type FileKind, type HostFile } from './outbox';

/** A file an agent sent to the phone. */
export type OutboxFile = {
  id: string;
  connectionId: string;
  /** The connection's name when it arrived. */
  host: string;
  name: string;
  kind: FileKind;
  /** Bytes, on the host. */
  size: number;
  /** When the host last changed it (its clock). */
  modifiedAt: number;
  /** When it reached the phone (the phone's clock). */
  receivedAt: number;
  read: boolean;
  /** Too big to bring over: it's listed, and its text stayed on the host. */
  tooBig?: boolean;
};

const FILES_KEY = 'flare.outbox.v1';
/** Per connection, the version of each file on the host the phone already has. */
const SEEN_KEY = 'flare.outbox.seen.v1';
const textKey = (id: string) => `flare.outbox.file.${id}`;

/** The phone keeps the newest files, up to this many… */
export const KEEP_FILES = 50;
/** …and this much text. */
export const KEEP_BYTES = 20_000_000;

type Seen = Record<string, Record<string, string>>;

function toFile(value: unknown): OutboxFile | null {
  if (typeof value !== 'object' || value === null) return null;
  const file = value as Partial<OutboxFile>;
  const valid =
    typeof file.id === 'string' &&
    typeof file.connectionId === 'string' &&
    typeof file.host === 'string' &&
    typeof file.name === 'string' &&
    kindOf(file.name) === file.kind &&
    typeof file.size === 'number' &&
    typeof file.modifiedAt === 'number' &&
    typeof file.receivedAt === 'number' &&
    typeof file.read === 'boolean';
  return valid ? (file as OutboxFile) : null;
}

const newId = (now: number) => `f${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The files agents sent, newest first, kept on the phone (plain storage, like the
 * connections list: they aren't secrets). The text of each is stored apart from the list,
 * so the list loads without it.
 */
export class OutboxStore {
  private files: OutboxFile[];
  private seen: Seen;
  private listeners = new Set<() => void>();

  constructor() {
    this.files = (readJson<unknown[]>(FILES_KEY) ?? []).map(toFile).filter((file) => !!file);
    this.seen = readJson<Seen>(SEEN_KEY) ?? {};
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.files;

  get(id: string): OutboxFile | null {
    return this.files.find((file) => file.id === id) ?? null;
  }

  text(id: string): string | null {
    return readJson<string>(textKey(id));
  }

  /** Whether this version of a host's file hasn't come over yet. */
  isNew(connectionId: string, file: HostFile): boolean {
    return this.seen[connectionId]?.[file.name] !== versionOf(file);
  }

  /**
   * Forgets what came from files that are no longer on the host, so the record stays the
   * size of the folder (and a file made again with the same name comes over).
   */
  keepSeen(connectionId: string, files: HostFile[]) {
    const seen = this.seen[connectionId];
    if (!seen) return;
    const names = new Set(files.map(({ name }) => name));
    const kept = Object.fromEntries(Object.entries(seen).filter(([name]) => names.has(name)));
    if (Object.keys(kept).length === Object.keys(seen).length) return;
    this.seen = { ...this.seen, [connectionId]: kept };
    writeJson(SEEN_KEY, this.seen);
  }

  /** Takes these versions of a host's files as had, without bringing them over. */
  markSeen(connectionId: string, files: HostFile[]) {
    if (!files.length) return;
    const versions = Object.fromEntries(files.map((file) => [file.name, versionOf(file)]));
    this.seen = { ...this.seen, [connectionId]: { ...this.seen[connectionId], ...versions } };
    writeJson(SEEN_KEY, this.seen);
  }

  /**
   * Keeps a file from a host, `text` null when it was too big to bring over. A newer version
   * of a file the phone has takes its place (and its id), unread again.
   */
  receive(
    connectionId: string,
    host: string,
    file: HostFile,
    text: string | null,
    now: number
  ): OutboxFile {
    const earlier = this.files.find(
      (candidate) => candidate.connectionId === connectionId && candidate.name === file.name
    );
    const received: OutboxFile = {
      id: earlier?.id ?? newId(now),
      connectionId,
      host,
      name: file.name,
      kind: file.kind,
      size: file.size,
      modifiedAt: file.modifiedAt,
      receivedAt: now,
      read: false,
      ...(text === null ? { tooBig: true } : {}),
    };
    if (text === null) removeJson(textKey(received.id));
    else writeJson(textKey(received.id), text);
    this.markSeen(connectionId, [file]);
    this.commit([received, ...this.files.filter(({ id }) => id !== received.id)]);
    return received;
  }

  markRead(id: string) {
    if (this.get(id)?.read !== false) return;
    this.commit(this.files.map((file) => (file.id === id ? { ...file, read: true } : file)));
  }

  /** Deletes the phone's copy. The host's stays, and doesn't come over again unless it changes. */
  remove(id: string) {
    removeJson(textKey(id));
    this.commit(this.files.filter((file) => file.id !== id));
  }

  /** Saves the list, dropping the oldest files past the limits (never the newest). */
  private commit(files: OutboxFile[]) {
    let bytes = 0;
    const kept = files.filter((file, index) => {
      bytes += file.tooBig ? 0 : file.size;
      const keep = index === 0 || (index < KEEP_FILES && bytes <= KEEP_BYTES);
      if (!keep) removeJson(textKey(file.id));
      return keep;
    });
    writeJson(FILES_KEY, kept);
    this.files = kept;
    for (const listener of this.listeners) listener();
  }
}
