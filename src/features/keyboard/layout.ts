import type { FunctionKey, SpecialKey } from '@/features/terminal/keys';

import type { ModifierName } from './modifiers';

/**
 * Keyboard layouts as data. The accessory bar is the control row on its own; the coding
 * keyboard is the same control row above a letters, symbols or navigation layer, so the
 * agent keys and the arrows never move. docs/keyboard.md has the diagrams.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export type LayerId = 'letters' | 'symbols' | 'nav';

export type KeyAction =
  /** Characters to type. `shifted` replaces them while Shift is on (letters). */
  | { type: 'text'; text: string; shifted?: string }
  /** A special key, encoded by the terminal view. `shifted` replaces it while Shift is on. */
  | { type: 'key'; key: SpecialKey; shifted?: SpecialKey }
  /** A tap on a sticky modifier key: off → once → (double tap) locked. */
  | { type: 'modifier'; modifier: ModifierName | 'shift' }
  /** A long press on a modifier key. */
  | { type: 'lock'; modifier: ModifierName | 'shift' }
  | { type: 'layer'; layer: LayerId }
  /** Switch between the coding keyboard and the phone's own keyboard. */
  | { type: 'switch'; to: 'coding' | 'system' };

/** A second output on a key, sent by flicking towards `direction` (or, for up, a long press). */
export type Secondary = {
  action: KeyAction;
  label: string;
  name: string;
  /** Works, but isn't drawn on the key (it would crowd an icon). The popup still shows it. */
  hidden?: boolean;
};

/**
 * - press: sends on release; a flick sends a secondary; a long press sends the up secondary.
 * - repeat: like press, but holding repeats the key (backspace, arrows in the nav layer).
 * - modifier: sticky Ctrl, Alt or Shift; a long press locks; hold it to chord with another key.
 * - arrows: the joystick: tap a side, flick, or hold off-centre to repeat, faster further out.
 * - space: a tap types a space; sliding along it moves the cursor like a trackpad.
 */
export type KeyBehavior = 'press' | 'repeat' | 'modifier' | 'arrows' | 'space';

export type KeyTone = 'char' | 'function' | 'accent';

export type KeyIcon = 'keyboard' | 'globe' | 'backspace' | 'return' | 'shift';

export type KeyDef = {
  /** Unique within a keyboard (control row plus a layer). */
  id: string;
  label: string;
  /** Accessible name. */
  name: string;
  /** Width in key units; a row's keys share its width in proportion. */
  units: number;
  behavior: KeyBehavior;
  tone: KeyTone;
  /** What a tap sends; null for the arrows key, where the side you tap decides. */
  tap: KeyAction | null;
  flicks: Partial<Record<Direction, Secondary>>;
  icon?: KeyIcon;
};

export type Row = {
  keys: KeyDef[];
  height: number;
  /** Empty units at each end (QWERTY's half-key stagger). Touches there go to the end keys. */
  inset: number;
};

export const CONTROL_ROW_HEIGHT = 46;
export const KEY_ROW_HEIGHT = 50;

const SYMBOL_NAMES: Record<string, string> = {
  '|': 'Pipe',
  '~': 'Tilde',
  '`': 'Backtick',
  '<': 'Less than',
  '>': 'Greater than',
  '/': 'Slash',
  '\\': 'Backslash',
  '-': 'Dash',
  _: 'Underscore',
  '[': 'Left bracket',
  ']': 'Right bracket',
  '{': 'Left brace',
  '}': 'Right brace',
  '(': 'Left parenthesis',
  ')': 'Right parenthesis',
  '=': 'Equals',
  '+': 'Plus',
  '*': 'Asterisk',
  $: 'Dollar',
  '#': 'Hash',
  '@': 'At',
  '!': 'Exclamation mark',
  '?': 'Question mark',
  '"': 'Double quote',
  "'": 'Single quote',
  ':': 'Colon',
  ';': 'Semicolon',
  '&': 'Ampersand',
  '%': 'Percent',
  '^': 'Caret',
  ',': 'Comma',
  '.': 'Period',
};

/** The accessible name of a character: "Pipe" for |, the character itself for letters and digits. */
export function characterName(char: string): string {
  return SYMBOL_NAMES[char] ?? char;
}

function text(value: string, shifted?: string): KeyAction {
  return shifted ? { type: 'text', text: value, shifted } : { type: 'text', text: value };
}

function special(key: SpecialKey): KeyAction {
  return { type: 'key', key };
}

function secondaryChar(char: string): Secondary {
  return { action: text(char), label: char, name: characterName(char) };
}

type KeyOptions = Partial<Omit<KeyDef, 'id' | 'label' | 'name' | 'tap'>>;

function key(
  id: string,
  label: string,
  name: string,
  tap: KeyAction | null,
  options: KeyOptions = {}
): KeyDef {
  return {
    id,
    label,
    name,
    tap,
    units: 1,
    behavior: 'press',
    tone: 'function',
    flicks: {},
    ...options,
  };
}

/** A character key; `up` is the secondary a flick up or a long press types. */
function char(value: string, { up, units = 1 }: { up?: string; units?: number } = {}): KeyDef {
  return key(`char:${value}`, value, characterName(value), text(value), {
    tone: 'char',
    units,
    flicks: up ? { up: secondaryChar(up) } : {},
  });
}

function letter(value: string, up?: string): KeyDef {
  const def = char(value, { up });
  return { ...def, tap: text(value, value.toUpperCase()) };
}

/** A symbol key with a character in each direction, like a kana flick key. */
function flickKey(value: string, flicks: Partial<Record<Direction, string>>, units = 1): KeyDef {
  const secondaries: Partial<Record<Direction, Secondary>> = {};
  for (const direction of DIRECTIONS) {
    const symbol = flicks[direction];
    if (symbol) secondaries[direction] = secondaryChar(symbol);
  }
  return { ...char(value, { units }), id: `flick:${value}`, flicks: secondaries };
}

function chars(values: string, ups = ''): KeyDef[] {
  return [...values].map((value, index) => char(value, { up: ups[index] }));
}

function letters(values: string, ups: string): KeyDef[] {
  return [...values].map((value, index) => letter(value, ups[index]));
}

// --- The control row: the accessory bar, and the top row of the coding keyboard ---------

const ESCAPE = key('escape', 'esc', 'Escape', special('escape'));

// Shift+Tab switches modes in agent CLIs like Claude Code: one flick up from Tab.
const TAB = key(
  'tab',
  'tab',
  'Tab',
  { type: 'key', key: 'tab', shifted: 'shift-tab' },
  {
    flicks: { up: { action: special('shift-tab'), label: '⇧tab', name: 'Shift Tab' } },
  }
);

// Ctrl-C (interrupt) is one flick up from Ctrl, with no sticky state involved.
const CTRL = key(
  'ctrl',
  'ctrl',
  'Control',
  { type: 'modifier', modifier: 'ctrl' },
  {
    behavior: 'modifier',
    flicks: { up: { action: text('\x03'), label: '^C', name: 'Control C' } },
  }
);

const ALT = key(
  'alt',
  'alt',
  'Alt',
  { type: 'modifier', modifier: 'alt' },
  {
    behavior: 'modifier',
  }
);

const ARROWS = key('arrows', '', 'Arrow keys', null, { behavior: 'arrows', units: 2 });

// The symbols phone keyboards bury two layers deep, five per key.
const PIPE = flickKey('|', { up: '~', down: '`', left: '<', right: '>' });
const SLASH = flickKey('/', { up: '\\', down: '-', left: '[', right: ']' });

const OPEN_KEYBOARD = key(
  'switch',
  '',
  'Coding keyboard',
  { type: 'switch', to: 'coding' },
  {
    icon: 'keyboard',
  }
);

// The phone's keyboard, in a text field: for prose, with autocorrect, swiping and dictation.
const SYSTEM_KEYBOARD = key(
  'switch',
  '',
  'Phone keyboard',
  { type: 'switch', to: 'system' },
  {
    icon: 'globe',
  }
);

function controlRow(last: KeyDef): Row {
  return {
    keys: [ESCAPE, TAB, CTRL, ALT, ARROWS, PIPE, SLASH, last],
    height: CONTROL_ROW_HEIGHT,
    inset: 0,
  };
}

/** Mode A: the bar above the phone's keyboard. Its last key opens the coding keyboard. */
export const BAR_ROWS: Row[] = [controlRow(OPEN_KEYBOARD)];

// --- The coding keyboard's layers ------------------------------------------------------

const SHIFT = key(
  'shift',
  '',
  'Shift',
  { type: 'modifier', modifier: 'shift' },
  {
    behavior: 'modifier',
    icon: 'shift',
    units: 1.5,
  }
);

// Swipe left to delete a word (Ctrl-W), as on Gboard; swipe right to delete forwards.
const BACKSPACE = key('backspace', '', 'Backspace', special('backspace'), {
  behavior: 'repeat',
  icon: 'backspace',
  units: 1.5,
  flicks: {
    left: { action: text('\x17'), label: '^W', name: 'Delete word', hidden: true },
    right: { action: special('delete'), label: 'del', name: 'Delete' },
  },
});

// Ctrl-J is a line feed: a new line in an agent's prompt without sending it.
const ENTER = key('enter', '', 'Enter', special('enter'), {
  tone: 'accent',
  icon: 'return',
  units: 2,
  flicks: { up: { action: text('\n'), label: '^J', name: 'New line' } },
});

function space(units: number): KeyDef {
  return key('space', 'space', 'Space', text(' '), { behavior: 'space', tone: 'char', units });
}

function layerKey(label: string, name: string, layer: LayerId, units: number): KeyDef {
  return key(`layer:${layer}`, label, name, { type: 'layer', layer }, { units });
}

const TO_SYMBOLS = {
  ...layerKey('123', 'Symbols', 'symbols', 1.5),
  flicks: {
    up: { action: { type: 'layer', layer: 'nav' }, label: 'fn', name: 'Navigation keys' },
  },
} satisfies KeyDef;

function nav(id: SpecialKey, label: string, name: string, repeat = false, units = 2): KeyDef {
  return key(id, label, name, special(id), { units, behavior: repeat ? 'repeat' : 'press' });
}

// The arrows stand out from the keys around them, like the character keys do.
function navArrow(id: SpecialKey, label: string, name: string): KeyDef {
  return { ...nav(id, label, name, true), tone: 'char' };
}

function functionKey(index: number): KeyDef {
  const id = `f${index}` as FunctionKey;
  return key(id, `F${index}`, `F${index}`, special(id));
}

const LAYERS: Record<LayerId, Row[]> = {
  // QWERTY, with digits and Gboard's long-press symbols one flick up (except h, which
  // gives = here: the bottom row already has a dash key).
  letters: [
    { keys: letters('qwertyuiop', '1234567890'), height: KEY_ROW_HEIGHT, inset: 0 },
    { keys: letters('asdfghjkl', '@#$_&=+()'), height: KEY_ROW_HEIGHT, inset: 0.5 },
    {
      keys: [SHIFT, ...letters('zxcvbnm', '*"\':;!?'), BACKSPACE],
      height: KEY_ROW_HEIGHT,
      inset: 0,
    },
    {
      // Home and End either side of space, where the cursor goes.
      keys: [
        TO_SYMBOLS,
        char('-', { up: '_' }),
        nav('home', 'home', 'Home', false, 1),
        space(2.5),
        nav('end', 'end', 'End', false, 1),
        char('.', { up: ',' }),
        ENTER,
      ],
      height: KEY_ROW_HEIGHT,
      inset: 0,
    },
  ],
  // Every symbol a shell needs in one tap or one flick; digits carry their US shifted pair.
  symbols: [
    { keys: chars('1234567890', '!@#$%^&*()'), height: KEY_ROW_HEIGHT, inset: 0 },
    {
      keys: [
        char('-', { up: '_' }),
        char('=', { up: '+' }),
        char('/', { up: '?' }),
        char('\\'),
        char('|'),
        char('&'),
        char('$'),
        char(';', { up: ':' }),
        char("'", { up: '`' }),
        char('"'),
      ],
      height: KEY_ROW_HEIGHT,
      inset: 0,
    },
    {
      keys: [
        layerKey('fn', 'Navigation keys', 'nav', 1),
        ...chars('()[]{}<>'),
        { ...BACKSPACE, units: 1 },
      ],
      height: KEY_ROW_HEIGHT,
      inset: 0,
    },
    {
      keys: [
        layerKey('abc', 'Letters', 'letters', 1.5),
        char('~'),
        space(4.5),
        char('.', { up: ',' }),
        ENTER,
      ],
      height: KEY_ROW_HEIGHT,
      inset: 0,
    },
  ],
  // An inverted-T arrow cluster for people who prefer keys to the joystick, plus F1-F12.
  nav: [
    {
      keys: Array.from({ length: 12 }, (_, index) => functionKey(index + 1)),
      height: KEY_ROW_HEIGHT,
      inset: 0,
    },
    {
      keys: [
        nav('home', 'home', 'Home'),
        navArrow('up', '↑', 'Up arrow'),
        nav('end', 'end', 'End'),
        nav('page-up', 'pgup', 'Page up', true),
        nav('insert', 'ins', 'Insert'),
      ],
      height: KEY_ROW_HEIGHT,
      inset: 0,
    },
    {
      keys: [
        navArrow('left', '←', 'Left arrow'),
        navArrow('down', '↓', 'Down arrow'),
        navArrow('right', '→', 'Right arrow'),
        nav('page-down', 'pgdn', 'Page down', true),
        nav('delete', 'del', 'Delete', true),
      ],
      height: KEY_ROW_HEIGHT,
      inset: 0,
    },
    {
      keys: [
        layerKey('abc', 'Letters', 'letters', 1.5),
        layerKey('123', 'Symbols', 'symbols', 1.5),
        space(5),
        ENTER,
      ],
      height: KEY_ROW_HEIGHT,
      inset: 0,
    },
  ],
};

/** Mode B: the control row above the current layer. */
export function keyboardRows(layer: LayerId): Row[] {
  return [controlRow(SYSTEM_KEYBOARD), ...LAYERS[layer]];
}

/** The key's label for the current Shift state (Q instead of q). */
export function labelFor(key: KeyDef, shift: boolean): string {
  if (shift && key.tap?.type === 'text' && key.tap.shifted) return key.tap.shifted;
  return key.label;
}

/** The arrows key's outputs: arrows, or Home/End/PgUp/PgDn after a long press. */
export const ARROW_KEYS: Record<Direction, SpecialKey> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
};

export const PAGE_KEYS: Record<Direction, SpecialKey> = {
  up: 'page-up',
  down: 'page-down',
  left: 'home',
  right: 'end',
};
