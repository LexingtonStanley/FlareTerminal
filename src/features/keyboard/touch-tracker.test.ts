import { placeKeys, type PlacedKey } from './geometry';
import { TIMING } from './gestures';
import type { HeldModifiers } from './keyboard-state';
import { keyboardRows, type KeyAction } from './layout';
import { TouchTracker, type ActiveKey, type TouchPoint } from './touch-tracker';

/** A clock the test moves by hand, with timers that fire as it passes them. */
class ManualClock {
  time = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();
  private nextId = 1;

  now = () => this.time;

  setTimeout = (callback: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + ms, callback });
    return id;
  };

  clearTimeout = (handle: unknown) => {
    this.timers.delete(handle as number);
  };

  advance(ms: number) {
    const until = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].callback();
    }
    this.time = until;
  }
}

const KEYS: PlacedKey[] = placeKeys(keyboardRows('letters'), 400, 0);

function at(name: string, id = '1', dx = 0, dy = 0): TouchPoint {
  const placed = KEYS.find((key) => key.key.name === name);
  if (!placed) throw new Error(`No key named ${name}`);
  const { x, y, width, height } = placed.rect;
  return { id, x: x + width / 2 + dx, y: y + height / 2 + dy };
}

function setup() {
  const clock = new ManualClock();
  const sent: { action: KeyAction; keyId: string; held: HeldModifiers }[] = [];
  const active: ActiveKey[][] = [];
  const haptics: string[] = [];
  const tracker = new TouchTracker(
    {
      onAction: (action, { keyId, held }) => sent.push({ action, keyId, held }),
      onActiveChange: (keys) => active.push(keys),
      onHaptic: (kind) => haptics.push(kind),
    },
    clock
  );
  tracker.update(KEYS, {
    onAction: (action, { keyId, held }) => sent.push({ action, keyId, held }),
    onActiveChange: (keys) => active.push(keys),
    onHaptic: (kind) => haptics.push(kind),
  });
  const texts = () => sent.flatMap(({ action }) => (action.type === 'text' ? [action.text] : []));
  return { clock, tracker, sent, active, haptics, texts };
}

describe('TouchTracker', () => {
  it('sends a tapped key and reports it pressed while down', () => {
    const { tracker, texts, active, haptics } = setup();

    tracker.start([at('q')]);
    expect(active.at(-1)).toEqual([
      expect.objectContaining({ keyId: 'char:q', direction: null, offset: { x: 0, y: 0 } }),
    ]);
    tracker.release([at('q')]);

    expect(texts()).toEqual(['q']);
    expect(active.at(-1)).toEqual([]);
    expect(haptics).toEqual(['key']);
  });

  it('keeps the order of fast two-thumb typing (rollover)', () => {
    const { tracker, texts } = setup();

    tracker.start([at('h', '1')]);
    tracker.start([at('i', '2')]);
    // h was sent when i went down, so releasing out of order changes nothing.
    tracker.end([at('i', '2')]);
    tracker.release([at('h', '1')]);

    expect(texts()).toEqual(['h', 'i']);
  });

  it('chords: a key typed while Ctrl is held gets Ctrl, and Ctrl stays off', () => {
    const { tracker, sent } = setup();

    tracker.start([at('Control', '1')]);
    tracker.start([at('c', '2')]);
    tracker.end([at('c', '2')]);
    tracker.release([at('Control', '1')]);

    expect(sent.map(({ action, held }) => [action.type, held.ctrl])).toEqual([['text', true]]);
  });

  it('runs the timers gestures ask for: a held backspace repeats', () => {
    const { clock, tracker, sent } = setup();

    tracker.start([at('Backspace')]);
    clock.advance(TIMING.repeatDelayMs + 500);
    tracker.release([at('Backspace')]);

    expect(sent.length).toBeGreaterThan(5);
    expect(sent.every(({ action }) => action.type === 'key' && action.key === 'backspace')).toBe(
      true
    );
  });

  it('stops repeating when the finger lifts', () => {
    const { clock, tracker, sent } = setup();

    tracker.start([at('Backspace')]);
    clock.advance(TIMING.repeatDelayMs + 200);
    tracker.release([at('Backspace')]);
    const count = sent.length;
    clock.advance(2000);

    expect(sent).toHaveLength(count);
  });

  it('moves the joystick and reports its offset', () => {
    const { tracker, sent, active } = setup();

    tracker.start([at('Arrow keys')]);
    tracker.move([at('Arrow keys', '1', -20, 0)]);

    expect(sent.map(({ action }) => action)).toEqual([{ type: 'key', key: 'left' }]);
    expect(active.at(-1)).toEqual([
      expect.objectContaining({ keyId: 'arrows', direction: 'left', offset: { x: -20, y: 0 } }),
    ]);
    tracker.release([at('Arrow keys', '1', -20, 0)]);
  });

  it('sends nothing when the system takes the touch', () => {
    const { clock, tracker, sent, active } = setup();

    tracker.start([at('q')]);
    tracker.cancel();
    clock.advance(1000);

    expect(sent).toEqual([]);
    expect(active.at(-1)).toEqual([]);
  });

  it('ends a finger whose release went missing when the same id comes down again', () => {
    const { tracker, texts } = setup();

    tracker.start([at('a')]);
    tracker.start([at('s')]);
    tracker.release([at('s')]);

    expect(texts()).toEqual(['a', 's']);
  });
});
