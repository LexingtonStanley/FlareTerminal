import { randomBytes } from '@noble/hashes/utils.js';

import type { Tunnel, TunnelEvents } from '@/features/terminal/transport';

import { parseSshConfig, type SshConfig } from './ssh-config';

/**
 * Reading `~/.ssh/config` on a computer Flare is connected to, and the files its Include lines
 * name, through one command beside the session's terminal. The script only reads: it prints
 * each file after a line with a random marker, so a file can't pass for the end of another.
 */

/** Named so `ps` on the host (and a test) tells it from the other `sh -s` commands. */
export const READ_CONFIG_COMMAND = 'sh -s flare-ssh-config';

export type RunCommand = (command: string, events: TunnelEvents) => Promise<Tunnel>;

/** Include follows Include this many times over; OpenSSH stops at 16, configs at 1 or 2. */
const MAX_ROUNDS = 4;
/** More than any config; a pattern that matches something huge stops the read. */
const MAX_OUTPUT = 2_000_000;

const hex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const singleQuoted = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

/**
 * Where sh finds a pattern's files: OpenSSH reads a relative one in ~/.ssh and expands `~/`.
 * Null for a pattern Flare doesn't read (`~user/…`).
 */
function place(pattern: string): { dir: string; glob: string } | null {
  if (pattern.startsWith('~/')) return { dir: '"$HOME"', glob: pattern.slice(2) };
  if (pattern.startsWith('~')) return null;
  if (pattern.startsWith('/')) return { dir: '/', glob: pattern.slice(1) };
  return { dir: '"$HOME/.ssh"', glob: pattern };
}

/**
 * The script: for each pattern, the readable files it matches, each after `<marker> <index>`,
 * then `<marker> end`. The glob sits in a variable and expands unquoted, which globs it and
 * nothing more (no command substitution), so a pattern can't run anything.
 */
export function readScript(patterns: string[], marker: string): string {
  const lines = [
    "IFS='\n'",
    `emit() { [ -f "$2" ] && [ -r "$2" ] || return 0; echo "${marker} $1"; cat -- "$2" 2>/dev/null; echo; }`,
  ];
  patterns.forEach((pattern, index) => {
    const at = place(pattern);
    if (!at || !at.glob) return;
    lines.push(
      `cd ${at.dir} 2>/dev/null && p=${singleQuoted(at.glob)} && for f in $p; do emit ${index} "$f"; done`
    );
  });
  lines.push(`echo "${marker} end"; exit`);
  return `${lines.join('\n')}\n`;
}

/** Each pattern's files from what the script printed; null if it didn't finish. */
export function readOutput(output: string, marker: string, count: number): string[][] | null {
  const files: string[][] = Array.from({ length: count }, () => []);
  let current: { index: number; lines: string[] } | null = null;
  // The script's newline after each file puts the marker on a line of its own; the file is
  // the lines before it.
  const finish = () => {
    if (current) files[current.index]?.push(current.lines.join('\n'));
  };
  for (const line of output.split('\n')) {
    if (!line.startsWith(`${marker} `)) {
      current?.lines.push(line);
      continue;
    }
    finish();
    const word = line.slice(marker.length + 1);
    if (word === 'end') return files;
    current = { index: Number(word), lines: [] };
  }
  return null;
}

/** Runs the script for `patterns`: each one's files, in order. */
function readFiles(run: RunCommand, patterns: string[], timeout: number): Promise<string[][]> {
  const marker = `flare-${hex(randomBytes(8))}`;
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder();
    let output = '';
    let command: Tunnel | null = null;
    let settled = false;
    const settle = (outcome: { files: string[][] } | { error: Error }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      command?.close();
      if ('files' in outcome) resolve(outcome.files);
      else reject(outcome.error);
    };
    const timer = setTimeout(
      () => settle({ error: new Error('The computer stopped answering') }),
      timeout
    );
    run(READ_CONFIG_COMMAND, {
      onData: (bytes) => {
        output += decoder.decode(bytes, { stream: true });
        if (output.length > MAX_OUTPUT) settle({ error: new Error('Its SSH config is too big') });
      },
      onClose: () => {
        output += decoder.decode();
        const files = readOutput(output, marker, patterns.length);
        settle(files ? { files } : { error: new Error('The computer didn’t finish reading it') });
      },
    }).then(
      (opened) => {
        if (settled) return opened.close();
        command = opened;
        opened.write(new TextEncoder().encode(readScript(patterns, marker)));
      },
      () => settle({ error: new Error('The session isn’t connected') })
    );
  });
}

/**
 * The hosts in the computer's `~/.ssh/config`, with the files its Include lines name; null
 * when it has none.
 */
export async function readSshConfig(
  run: RunCommand,
  { timeout = 20_000 }: { timeout?: number } = {}
): Promise<SshConfig | null> {
  const [[text]] = await readFiles(run, ['config'], timeout);
  if (text === undefined) return null;
  const included = new Map<string, string[]>();
  const include = (pattern: string) => included.get(pattern);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { missing } = parseSshConfig(text, include);
    if (!missing.length) break;
    const found = await readFiles(run, missing, timeout);
    missing.forEach((pattern, index) => included.set(pattern, found[index]));
  }
  return parseSshConfig(text, include);
}
