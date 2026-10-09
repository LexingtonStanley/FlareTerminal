import type { AttentionKind, SessionSnapshot } from './session-manager';

/**
 * The agent inbox: every open session, sorted by what it needs from the person. All of it
 * comes from the session's headless screen, so nothing runs on the host.
 */

export type InboxGroup = 'needs-you' | 'finished' | 'working' | 'idle';

/** What a session's screen shows, read from its headless copy (see SessionManager.activity). */
export type SessionActivity = {
  /** The last line on screen worth showing in a list, or null for a blank screen. */
  preview: string | null;
  /** When what's on screen last changed (ignoring status bars and the like). */
  changedAt: number;
};

/**
 * What a session wants from the person, if anything: an alert they haven't seen, or a
 * question still on its screen (which keeps waiting after they've looked and left, until
 * it's answered).
 */
export function waitingFor(
  session: Pick<SessionSnapshot, 'attention' | 'prompt'>
): { message: string; since: number; kind: AttentionKind } | null {
  const prompt = session.prompt?.answered ? null : session.prompt;
  if (session.attention) {
    return {
      message: session.attention.body || prompt?.question || 'Needs your attention',
      since: session.attention.at,
      kind: session.attention.kind,
    };
  }
  if (prompt) return { message: prompt.question, since: prompt.at, kind: 'question' };
  return null;
}

/** A screen that changed this recently is an agent (or a build) at work. */
export const WORKING_WINDOW_MS = 4_000;

// Box drawing, blocks, shapes, braille spinners and the symbols agents use for bullets
// (Claude Code's ⏺ and ⎿, its ✻ spinner).
const DECORATION = /[⎰-⏿─-◿✀-➿⠀-⣿]/g;

/**
 * Lines that are chrome rather than content: multiplexer status bars (their clock would make
 * every session look busy) and agents' key hints under the input box.
 */
const CHROME = [
  // tmux's default status line: "[main] 0:claude* ... 14:05 09-Oct-26".
  /^\[[^\]]+\]\s+\d+:/,
  // zellij's tab bar and key hints.
  /\bZellij\b/,
  /Ctrl \+/,
  /<[a-z]> [A-Z]{3,}/,
  // Claude Code and Codex hints. Not "esc to interrupt": that's on the spinner line, which
  // says what the agent is doing and is the only line that moves while it thinks.
  /\? for shortcuts/i,
  /^(press enter to confirm or )?esc to (cancel|go back)$/i,
  /shift\+tab to/i,
  /ctrl\+[a-z] to /i,
];

/** The line as a list shows it: decoration and repeated spaces removed. */
export function cleanLine(line: string): string {
  return line.replace(DECORATION, ' ').replace(/\s+/g, ' ').trim();
}

/** Whether a line carries content: at least three letters or digits and not chrome. */
export function isMeaningful(line: string): boolean {
  const cleaned = cleanLine(line);
  if ((cleaned.match(/[\p{L}\p{N}]/gu) ?? []).length < 3) return false;
  return !CHROME.some((pattern) => pattern.test(cleaned));
}

/** The lines of a screen that carry content, in order, cleaned for display. */
export function contentLines(lines: readonly string[]): string[] {
  return lines.filter(isMeaningful).map(cleanLine);
}

/** The last line of a screen (top to bottom) that carries content, or null. */
export function lastMeaningfulLine(lines: readonly string[]): string | null {
  for (let index = lines.length - 1; index >= 0; index--) {
    if (isMeaningful(lines[index])) return cleanLine(lines[index]);
  }
  return null;
}

/**
 * Which part of the inbox a session belongs in. An unseen alert or a question on screen
 * needs the person; an agent that stopped by itself, unseen, is finished; a screen that
 * changed in the last few seconds is working; anything else (quiet, connecting,
 * disconnected) is idle.
 */
export function inboxGroup(
  session: Pick<SessionSnapshot, 'attention' | 'prompt' | 'status' | 'reconnecting'>,
  activity: SessionActivity | null,
  now: number
): InboxGroup {
  const waiting = waitingFor(session);
  if (waiting) return waiting.kind === 'finished' ? 'finished' : 'needs-you';
  if (
    session.status.state === 'connected' &&
    activity &&
    now - activity.changedAt < WORKING_WINDOW_MS
  ) {
    return 'working';
  }
  return 'idle';
}

/** A short duration for lists: "now", "45s", "12m", "3h", "2d". */
export function formatSince(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
