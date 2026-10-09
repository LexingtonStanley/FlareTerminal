import { placeKeys, rowUnits } from './geometry';
import {
  BAR_ROWS,
  DIRECTIONS,
  keyboardRows,
  labelFor,
  type KeyAction,
  type KeyDef,
  type LayerId,
  type Row,
} from './layout';

const LAYERS: LayerId[] = ['letters', 'symbols', 'nav'];

function allKeys(rows: Row[]): KeyDef[] {
  return rows.flatMap((row) => row.keys);
}

/** Everything a key sends in one gesture: its tap and each flick. */
function outputs(key: KeyDef): KeyAction[] {
  return [
    ...(key.tap ? [key.tap] : []),
    ...DIRECTIONS.flatMap((direction) => {
      const secondary = key.flicks[direction];
      return secondary ? [secondary.action] : [];
    }),
  ];
}

function typedTexts(rows: Row[]): Set<string> {
  const texts = new Set<string>();
  for (const key of allKeys(rows)) {
    for (const action of outputs(key)) {
      if (action.type === 'text') texts.add(action.text);
    }
  }
  return texts;
}

describe('the accessory bar', () => {
  it('has the agent keys on its one row', () => {
    const names = allKeys(BAR_ROWS).map((key) => key.name);
    expect(names).toEqual([
      'Escape',
      'Tab',
      'Control',
      'Alt',
      'Arrow keys',
      'Pipe',
      'Slash',
      'Coding keyboard',
    ]);
  });

  it('puts Shift+Tab and Ctrl-C one flick away', () => {
    const [, tab, ctrl] = BAR_ROWS[0].keys;
    expect(tab.flicks.up?.action).toEqual({ type: 'key', key: 'shift-tab' });
    expect(ctrl.flicks.up?.action).toEqual({ type: 'text', text: '\x03' });
  });

  it('gives every key at least 40 points of width on a 375-point phone', () => {
    for (const { rect } of placeKeys(BAR_ROWS, 375)) {
      expect(rect.width).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('the coding keyboard', () => {
  it.each(LAYERS)('has unique key ids in the %s layer', (layer) => {
    const ids = allKeys(keyboardRows(layer)).map((key) => key.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(LAYERS)('fills every row of the %s layer to the same width', (layer) => {
    const [, ...rows] = keyboardRows(layer);
    for (const row of rows) {
      // F1-F12 is the only row that isn't ten units wide.
      expect([10, 12]).toContain(rowUnits(row));
    }
  });

  it('keeps the bar on top, ending with the key that hides the keyboard', () => {
    for (const layer of LAYERS) {
      const [top] = keyboardRows(layer);
      expect(top.keys.map((key) => key.name).slice(0, -1)).toEqual(
        BAR_ROWS[0].keys.map((key) => key.name).slice(0, -1)
      );
      const last = top.keys.at(-1);
      expect(last?.tap).toEqual({ type: 'switch', to: 'hidden' });
      // A flick up opens the phone's keyboard instead.
      expect(last?.flicks.up?.action).toEqual({ type: 'switch', to: 'system' });
    }
  });

  it('types every letter and digit from the letters layer', () => {
    const texts = typedTexts(keyboardRows('letters'));
    for (const char of 'abcdefghijklmnopqrstuvwxyz0123456789') expect(texts).toContain(char);
  });

  it('reaches every shell symbol in one tap or flick from the symbols layer', () => {
    const texts = typedTexts(keyboardRows('symbols'));
    for (const char of '|&;<>~/\\-_=+*$#@!?"\'`()[]{}:%^,.') expect(texts).toContain(char);
  });

  it('reaches the common ones without leaving the letters', () => {
    const texts = typedTexts(keyboardRows('letters'));
    for (const char of '|&;<>~/\\-_=+*$#@!?"\'`()[]:,.') expect(texts).toContain(char);
  });

  it('reaches every special key from the navigation layer', () => {
    const keys = new Set(
      allKeys(keyboardRows('nav')).flatMap((key) =>
        outputs(key).flatMap((action) => (action.type === 'key' ? [action.key] : []))
      )
    );
    for (const key of [
      'escape',
      'tab',
      'shift-tab',
      'up',
      'down',
      'left',
      'right',
      'home',
      'end',
      'page-up',
      'page-down',
      'insert',
      'delete',
      'enter',
      'f1',
      'f12',
    ] as const) {
      expect(keys).toContain(key);
    }
  });

  it('shows capitals while Shift is on', () => {
    const q = allKeys(keyboardRows('letters')).find((key) => key.name === 'q')!;
    expect(labelFor(q, false)).toBe('q');
    expect(labelFor(q, true)).toBe('Q');
  });
});
