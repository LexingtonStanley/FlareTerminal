/**
 * The extra keys a phone keyboard lacks, as the bytes a terminal expects.
 * Keep the logic here pure: the key bar and the terminal view only route input.
 */

export type SpecialKey =
  | 'enter'
  | 'escape'
  | 'tab'
  | 'shift-tab'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'home'
  | 'end'
  | 'page-up'
  | 'page-down';

export type Modifiers = { ctrl: boolean; alt: boolean };

export const NO_MODIFIERS: Modifiers = { ctrl: false, alt: false };

const ARROWS = { up: 'A', down: 'B', right: 'C', left: 'D' } as const;

/**
 * Bytes for a special key. Arrow keys depend on DECCKM (application cursor mode),
 * which full-screen apps like vim and less switch on.
 */
export function sequenceForKey(key: SpecialKey, { applicationCursor = false } = {}): string {
  switch (key) {
    case 'enter':
      return '\r';
    case 'escape':
      return '\x1b';
    case 'tab':
      return '\t';
    case 'shift-tab':
      return '\x1b[Z';
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return (applicationCursor ? '\x1bO' : '\x1b[') + ARROWS[key];
    case 'home':
      return applicationCursor ? '\x1bOH' : '\x1b[H';
    case 'end':
      return applicationCursor ? '\x1bOF' : '\x1b[F';
    case 'page-up':
      return '\x1b[5~';
    case 'page-down':
      return '\x1b[6~';
  }
}

/** Ctrl+<char> as a control byte, or null when the combination has no byte. */
export function controlCharacter(char: string): string | null {
  if (char.length !== 1) return null;
  const upper = char.toUpperCase();
  const code = upper.charCodeAt(0);
  // Ctrl+@ (and Ctrl+Space) is NUL; Ctrl+A..Z and Ctrl+[ \ ] ^ _ are 0x01..0x1f.
  if (upper === ' ') return '\x00';
  if (code >= 0x40 && code <= 0x5f) return String.fromCharCode(code - 0x40);
  if (upper === '?') return '\x7f';
  return null;
}

/**
 * Applies sticky key-bar modifiers to what the keyboard typed. Ctrl applies to a
 * single character; Alt prefixes ESC (the "meta sends escape" convention).
 */
export function applyModifiers(data: string, { ctrl, alt }: Modifiers): string {
  let result = data;
  if (ctrl) result = controlCharacter(data) ?? data;
  if (alt) result = '\x1b' + result;
  return result;
}
