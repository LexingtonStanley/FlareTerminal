import { hitTest, placeKeys, surfaceHeight } from './geometry';
import { keyboardRows, type KeyDef, type Row } from './layout';

function testKey(id: string, units = 1): KeyDef {
  return {
    id,
    label: id,
    name: id,
    units,
    behavior: 'press',
    tone: 'char',
    tap: { type: 'text', text: id },
    flicks: {},
  };
}

// 100 wide: a row of a, b (2 units), c; then a staggered row of d, e.
const ROWS: Row[] = [
  { keys: [testKey('a'), testKey('b', 2), testKey('c')], height: 40, inset: 0 },
  { keys: [testKey('d'), testKey('e')], height: 50, inset: 0.5 },
];

describe('placeKeys', () => {
  it('shares each row out by key units, below the top padding', () => {
    const placed = placeKeys(ROWS, 100, 4);
    expect(placed.map(({ key, rect }) => [key.id, rect])).toEqual([
      ['a', { x: 0, y: 4, width: 25, height: 40 }],
      ['b', { x: 25, y: 4, width: 50, height: 40 }],
      ['c', { x: 75, y: 4, width: 25, height: 40 }],
      ['d', { x: 100 / 6, y: 44, width: 100 / 3, height: 50 }],
      ['e', { x: 50, y: 44, width: 100 / 3, height: 50 }],
    ]);
  });

  it('measures the surface height', () => {
    expect(surfaceHeight(ROWS, { top: 4, bottom: 6 })).toBe(100);
  });
});

describe('hitTest', () => {
  const placed = placeKeys(ROWS, 100, 4);
  const at = (x: number, y: number) => hitTest(placed, { x, y })?.key.id;

  it('finds the key under the touch', () => {
    expect(at(10, 20)).toBe('a');
    expect(at(60, 20)).toBe('b');
    expect(at(60, 60)).toBe('e');
  });

  it('gives a touch between rows or in the stagger to the nearest key', () => {
    expect(at(2, 60)).toBe('d');
    expect(at(98, 60)).toBe('e');
  });

  it('gives touches beyond the edges to the edge keys', () => {
    expect(at(-10, 0)).toBe('a');
    expect(at(120, 200)).toBe('e');
  });

  it('splits keys exactly at their shared edge', () => {
    expect(at(25, 20)).toBe('b');
    expect(at(24.9, 20)).toBe('a');
  });

  it('has no dead spots on the real keyboard', () => {
    const keyboard = placeKeys(keyboardRows('letters'), 390, 4);
    for (let y = 0; y < 260; y += 7) {
      for (let x = 0; x < 390; x += 5) {
        expect(hitTest(keyboard, { x, y })).not.toBeNull();
      }
    }
  });

  it('returns null with no keys', () => {
    expect(hitTest([], { x: 0, y: 0 })).toBeNull();
  });
});
