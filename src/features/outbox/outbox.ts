import { quote } from '@/features/shortcuts/shell';

/**
 * The agent outbox: Markdown and HTML an agent saves in `~/.flare/outbox/` on the host come
 * to the phone. One small `sh` script beside an SSH session lists the folder every few
 * seconds (nothing to install, and Flare makes nothing on the host: the agent makes the
 * folder); a second reads a file that's new or changed.
 */

/** Where agents put files for the phone, for sh (which expands $HOME). */
export const OUTBOX_DIR = '$HOME/.flare/outbox';

/** The folder as a person or an agent writes it. */
export const OUTBOX_PATH = '~/.flare/outbox/';

/** Seconds between looks at the folder. */
export const OUTBOX_INTERVAL = 5;

/**
 * Seconds a file must have gone unchanged before it comes over, so one the agent is still
 * writing waits for the next look rather than arriving half written.
 */
export const SETTLE_SECONDS = 2;

/** Files bigger than this stay on the host; the app lists them and says why. */
export const MAX_FILE_BYTES = 5_000_000;

export type FileKind = 'markdown' | 'html';

const KINDS = new Map<string, FileKind>([
  ['md', 'markdown'],
  ['markdown', 'markdown'],
  ['html', 'html'],
  ['htm', 'html'],
]);

/** Markdown or HTML, from the name; null for anything else. */
export function kindOf(name: string): FileKind | null {
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();
  return (extension && KINDS.get(extension)) || null;
}

/**
 * Runs with `sh -s`, like the health strip's, and repeats: the host's clock (`now <epoch>`),
 * a `<modified> <size> <name>` line for each Markdown or HTML file, then `end`. GNU stat
 * (Linux, busybox) or BSD stat (macOS). Symbolic links are left out, so only files written
 * into the folder come over, and so are files the account can't read.
 */
export const WATCH_SCRIPT = `export LC_ALL=C
while :; do
  echo "now $(date +%s)"
  if cd "${OUTBOX_DIR}" 2>/dev/null; then
    for f in *.md *.markdown *.html *.htm *.MD *.HTML; do
      [ -f "$f" ] && [ -r "$f" ] && [ ! -L "$f" ] || continue
      stat -c '%Y %s %n' -- "$f" 2>/dev/null || stat -f '%m %z %N' -- "$f" 2>/dev/null
    done
  fi
  echo end
  sleep ${OUTBOX_INTERVAL} || exit
done
`;

/** A file in the outbox, as the host lists it. */
export type HostFile = { name: string; kind: FileKind; size: number; modifiedAt: number };

/** One look at the folder: the host's clock then (ms; null if it didn't say) and its files. */
export type Listing = { now: number | null; files: HostFile[] };

/** One listing (the lines before `end`). */
export function parseListing(block: string): Listing {
  let now: number | null = null;
  const files: HostFile[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const clock = /^now (\d+)$/.exec(line);
    if (clock) {
      now = Number(clock[1]) * 1000;
      continue;
    }
    const match = /^(\d+) (\d+) (.+)$/.exec(line);
    if (!match) continue;
    const [, modified, size, name] = match;
    const kind = kindOf(name);
    // A name with a slash isn't one the loop listed.
    if (!kind || name.includes('/')) continue;
    files.push({ name, kind, size: Number(size), modifiedAt: Number(modified) * 1000 });
  }
  // The patterns overlap on a case-insensitive file system (macOS): each file once.
  const unique = new Map(files.map((file) => [file.name, file]));
  return { now, files: [...unique.values()] };
}

/** Feeds the script's output in as it arrives; `onListing` gets each whole listing. */
export function listingReader(onListing: (listing: Listing) => void) {
  let buffer = '';
  return (text: string) => {
    buffer += text;
    let end: RegExpExecArray | null;
    while ((end = /^end\r?$/m.exec(buffer))) {
      onListing(parseListing(buffer.slice(0, end.index)));
      buffer = buffer.slice(end.index + end[0].length).replace(/^\n/, '');
    }
  };
}

/** Whether the agent has finished writing the file, as far as the host's clock tells. */
export function isSettled(file: HostFile, now: number | null): boolean {
  return now === null || now - file.modifiedAt >= SETTLE_SECONDS * 1000;
}

/** What the read script prints before the file, so a file that's gone isn't read as empty. */
export const READ_MARK = 'flare-file';

/**
 * Prints one file of the outbox, for `sh -s`: a `flare-file` line, then the file, if it's
 * still a file the account can read and not a link. `exit` on the same line, or sh would
 * wait for more script once the file is out. The name is the host's own, quoted.
 */
export function readScript(name: string): string {
  const path = `"${OUTBOX_DIR}"/${quote(name)}`;
  const checks = `[ -f ${path} ] && [ -r ${path} ] && [ ! -L ${path} ]`;
  return `${checks} && echo ${READ_MARK} && cat -- ${path} 2>/dev/null; exit\n`;
}

/**
 * The file's text from what the read script printed, or null when the host didn't print
 * the file (it went before it could be read).
 */
export function readOutput(bytes: Uint8Array): string | null {
  const header = new TextEncoder().encode(`${READ_MARK}\n`);
  if (bytes.length < header.length || header.some((byte, index) => bytes[index] !== byte)) {
    return null;
  }
  return new TextDecoder().decode(bytes.subarray(header.length));
}

/** The same version of a file: it needn't come over again. */
export function versionOf(file: Pick<HostFile, 'size' | 'modifiedAt'>): string {
  return `${file.modifiedAt}:${file.size}`;
}

/** What to tell an agent to send a result to the phone. */
export const SEND_TO_PHONE_PROMPT = `Save the result for my phone as a Markdown file (or one self-contained HTML page) in ${OUTBOX_PATH}, making the folder if needed.`;

/** The draft with the request to send the result to the phone after it. */
export function withSendToPhone(draft: string): string {
  const text = draft.trimEnd();
  if (!text.trim()) return SEND_TO_PHONE_PROMPT;
  // A sentence of its own after the person's.
  return `${/[.!?:;]$/.test(text) ? text : `${text}.`} ${SEND_TO_PHONE_PROMPT}`;
}

/** A size as people read it: 820 B, 12 KB, 3.4 MB. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 999_500) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1).replace(/\.0$/, '')} MB`;
}
