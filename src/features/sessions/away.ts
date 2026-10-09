import { cleanLine, contentLines, isChrome } from './inbox';
import { isWorkingLine } from './prompts';

/**
 * "While you were away": what a session wrote while the person looked elsewhere (another
 * session, Home, another app), and where it starts.
 */

/** A shorter absence doesn't count, so flicking between two sessions raises nothing. */
export const AWAY_MIN_MS = 10_000;

/** Lines above the first new one that a jump keeps in view, to show where it picks up. */
export const JUMP_CONTEXT_LINES = 2;

/**
 * What a screen says, ignoring status bars, key hints, decoration and an agent's working
 * line, whose timer ticks while it works.
 */
export function screenContent(lines: readonly string[]): string {
  return contentLines(lines.filter((line) => !isWorkingLine(line))).join('\n');
}

/**
 * How much of the end of the screen's text is looked for: enough to be specific, and more
 * than an agent's live area (spinner, input box, to-do list) holds, which is still there
 * at the end of the history when the person comes back.
 */
const ANCHOR_CHARS = 400;
/** Less than this could match anywhere. */
const MIN_ANCHOR_CHARS = 12;

/** The top or bottom of a box: a zellij pane's frame, with its title, or an input box. */
const FRAME = /^\s*[┌╭╔┏└╰╚┗]/;

/**
 * A line's text without decoration or any spaces, so lines wrapped anywhere still match.
 * Chrome, frames and working lines count as nothing: the history doesn't keep them.
 */
const squeeze = (line: string) =>
  isChrome(line) || FRAME.test(line) || isWorkingLine(line)
    ? ''
    : cleanLine(line).replace(/\s/g, '');

/**
 * Where the person left off in a session's history (tmux's, zellij's or the app's copy of
 * the screen): the index of the first history line after what was on `screen` when they
 * left, or null when it isn't there.
 *
 * The screen's text is looked for as one run of characters, so a line the screen wrapped
 * and the history didn't (or the other way round) still matches. The latest match wins.
 * The bottom of the screen is often an agent's live area (its spinner, its input box) that
 * never reaches the history, so when the whole screen isn't found, it tries again without
 * its last line, and so on up.
 */
export function findDeparture(
  history: readonly string[],
  screen: readonly string[]
): number | null {
  const anchors = screen.map(squeeze).filter(Boolean);
  let text = '';
  // Where each history line's text ends in `text`.
  const ends: number[] = [];
  for (const line of history) {
    text += squeeze(line);
    ends.push(text.length);
  }
  for (let kept = anchors.length; kept > 0; kept--) {
    const tail = anchors.slice(0, kept).join('').slice(-ANCHOR_CHARS);
    if (tail.length < MIN_ANCHOR_CHARS) return null;
    const at = text.lastIndexOf(tail);
    if (at < 0) continue;
    const end = at + tail.length;
    // The line holding the match's last character; the new output starts after it.
    return ends.findIndex((lineEnd) => lineEnd >= end) + 1;
  }
  return null;
}

/** How far "what's new" backs up, at most, to the top of the paragraph it starts in. */
const PARAGRAPH_LINES = 20;

/**
 * Where "what's new" starts in a history: at the first new line (see findDeparture), or the
 * top of the paragraph or tool call it continues, so it doesn't open on output whose
 * command is cut off. Null when the place isn't found or nothing follows it.
 */
export function newFrom(history: readonly string[], screen: readonly string[]): number | null {
  const start = findDeparture(history, screen);
  if (start === null || start >= history.length) return start;
  let from = start;
  while (from > 0 && start - from < PARAGRAPH_LINES && history[from - 1].trim()) from--;
  return from;
}
