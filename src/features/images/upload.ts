import { randomBytes } from '@noble/hashes/utils.js';

import type { Tunnel, TunnelEvents } from '@/features/terminal/transport';

/**
 * Sending an image to the session's host, for an agent to read: one command beside the
 * terminal, like the health strip's, saves it in Flare's folder on the host and prints its
 * path, which goes into the composer. Nothing is installed on the host. The command asks
 * `head -c` for exactly the image's bytes, so it needs no end-of-file from the app.
 */

/** Where images go on the host, for sh (which expands $HOME). Flare never deletes them. */
export const UPLOAD_DIR = '$HOME/.flare/uploads';

const SAVED = 'saved:';

export type ImageType = 'png' | 'jpg' | 'gif' | 'webp' | 'heic';

const startsWith = (bytes: Uint8Array, prefix: number[], at = 0) =>
  prefix.every((byte, i) => bytes[at + i] === byte);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** What the bytes are, from their first few (a picker's or clipboard's name can't be trusted). */
export function imageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(bytes, ascii('GIF8'))) return 'gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'webp';
  if (startsWith(bytes, ascii('ftyp'), 4) && /^(heic|heix|mif1|msf1)$/.test(brand(bytes))) {
    return 'heic';
  }
  return null;
}

function brand(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.subarray(8, 12));
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `flare-20261010-142301-3fa9.png`: sorts by time, and two in one second don't collide. */
export function uploadName(now: Date, type: ImageType, random = randomBytes(2)): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = [...random].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `flare-${date}-${time}-${suffix}.${type}`;
}

/**
 * The command: sh with a one-line script in single quotes, which every login shell (bash,
 * zsh, fish, csh) passes on untouched as long as it holds no quote, backslash or `!`. The
 * image is all of stdin. (The health strip's `sh -s` can't carry it: dash reads its script
 * in blocks, swallowing the start of the image.)
 */
export function uploadCommand(name: string, size: number, dir = UPLOAD_DIR): string {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`Not a file name: ${name}`);
  if (/["'`\\!\n]/.test(dir)) throw new Error(`The folder can't go in the command: ${dir}`);
  const script = [
    'exec 2>&1',
    'umask 077',
    `mkdir -p "${dir}" && cd "${dir}" || exit 1`,
    `head -c ${size} > ${name} && echo "${SAVED}$PWD/${name}"`,
  ].join('; ');
  return `sh -c '${script}'`;
}

/** The saved image's path, from what the script printed; else why it couldn't save it. */
export function parseUpload(output: string): { path: string } | { error: string } {
  const lines = output.split(/\r?\n/);
  const saved = lines.find((line) => line.startsWith(SAVED));
  if (saved) return { path: saved.slice(SAVED.length) };
  const reason = lines.map((line) => line.trim()).find(Boolean);
  return { error: reason ? `The host said: ${reason}` : 'The host didn’t save it' };
}

/** The path for a prompt: after what's written, with a space either side to type on. */
export function insertPath(draft: string, path: string): string {
  // Agents read a quoted path as one; a home folder rarely needs it.
  const word = /\s/.test(path) ? `"${path}"` : path;
  const before = draft === '' || /\s$/.test(draft) ? draft : `${draft} `;
  return `${before}${word} `;
}

/** Room for a slow phone network: a minute, and twenty seconds more per megabyte. */
export function sendTimeout(size: number): number {
  return 60_000 + Math.ceil(size / 1_000_000) * 20_000;
}

export type RunCommand = (command: string, events: TunnelEvents) => Promise<Tunnel>;

export type SendOptions = {
  now?: Date;
  /** Stops the upload; the promise then rejects. */
  signal?: AbortSignal;
  /** The folder on the host, for sh; tests use their own. */
  dir?: string;
};

/** Thrown when the person stopped the upload. */
export class SendCancelled extends Error {
  constructor() {
    super('Cancelled');
  }
}

/** Saves `bytes` on the host; resolves to its path there. */
export function sendImage(
  run: RunCommand,
  bytes: Uint8Array,
  { now = new Date(), signal, dir }: SendOptions = {}
): Promise<string> {
  const type = imageType(bytes);
  if (!type) {
    return Promise.reject(new Error('That isn’t a PNG, JPEG, GIF, WebP or HEIC image'));
  }
  if (signal?.aborted) return Promise.reject(new SendCancelled());
  const name = uploadName(now, type);

  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let command: Tunnel | null = null;
    let settled = false;

    const settle = (outcome: { path: string } | { error: Error }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      // Done (the host ended its side) or stopped: either way, close ours.
      command?.close();
      if ('path' in outcome) resolve(outcome.path);
      else reject(outcome.error);
    };
    const cancel = () => settle({ error: new SendCancelled() });
    const timer = setTimeout(
      () => settle({ error: new Error('The host stopped answering') }),
      sendTimeout(bytes.length)
    );
    signal?.addEventListener('abort', cancel);

    run(uploadCommand(name, bytes.length, dir), {
      onData: (chunk) => chunks.push(decoder.decode(chunk, { stream: true })),
      onClose: () => {
        chunks.push(decoder.decode());
        const result = parseUpload(chunks.join(''));
        settle('path' in result ? result : { error: new Error(result.error) });
      },
    }).then(
      (opened) => {
        if (settled) return opened.close();
        command = opened;
        opened.write(bytes);
      },
      () => settle({ error: new Error('The session isn’t connected') })
    );
  });
}
