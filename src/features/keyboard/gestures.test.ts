import type { Point } from './geometry';
import {
  beginGesture,
  commitForRollover,
  endGesture,
  flickDirection,
  joystickInterval,
  markChorded,
  moveGesture,
  padTapDirection,
  repeatInterval,
  tickGesture,
  TIMING,
  type Gesture,
} from './gestures';
import { BAR_ROWS, keyboardRows, type KeyAction, type KeyDef } from './layout';

const KEYS = [...BAR_ROWS, ...keyboardRows('letters'), ...keyboardRows('nav')].flatMap(
  (row) => row.keys
);

function keyNamed(name: string): KeyDef {
  const key = KEYS.find((candidate) => candidate.name === name);
  if (!key) throw new Error(`No key named ${name}`);
  return key;
}

const RECT = { x: 0, y: 0, width: 80, height: 40 };
const CENTER: Point = { x: 40, y: 20 };

/** Plays a gesture: press at the centre, then moves (relative to it) and waits, then release. */
class Finger {
  gesture: Gesture;
  now = 1000;
  sent: KeyAction[] = [];
  haptics: string[] = [];

  constructor(name: string, at: Point = CENTER) {
    const step = beginGesture(keyNamed(name), RECT, at, this.now);
    this.gesture = step.gesture;
    if (step.haptic) this.haptics.push(step.haptic);
  }

  private take(step: ReturnType<typeof moveGesture>) {
    this.gesture = step.gesture;
    this.sent.push(...step.actions);
    if (step.haptic) this.haptics.push(step.haptic);
  }

  move(dx: number, dy: number) {
    this.take(moveGesture(this.gesture, { x: CENTER.x + dx, y: CENTER.y + dy }, this.now));
    return this;
  }

  /** Advances time, running every timer that comes due on the way. */
  wait(ms: number) {
    const until = this.now + ms;
    while (this.gesture.nextAt !== null && this.gesture.nextAt <= until) {
      this.now = this.gesture.nextAt;
      this.take(tickGesture(this.gesture, this.now));
    }
    this.now = until;
    return this;
  }

  release() {
    this.take(endGesture(this.gesture, this.gesture.current, this.now));
    return this.sent;
  }
}

const text = (value: string): KeyAction => ({ type: 'text', text: value });
const key = (value: KeyAction & { type: 'key' }) => value;

describe('taps and flicks', () => {
  it('sends the tap on release', () => {
    const finger = new Finger('q');
    expect(finger.sent).toEqual([]);
    expect(finger.release()).toEqual([{ type: 'text', text: 'q', shifted: 'Q' }]);
  });

  it('keeps a small wobble a tap', () => {
    expect(new Finger('q').move(6, -8).release()).toEqual([
      { type: 'text', text: 'q', shifted: 'Q' },
    ]);
  });

  it('sends the up secondary for a flick up', () => {
    expect(new Finger('q').move(0, -TIMING.flickDistance).release()).toEqual([text('1')]);
  });

  it('accepts a flick up to 60 degrees off', () => {
    // 50° from vertical.
    expect(new Finger('q').move(23, -19).release()).toEqual([text('1')]);
  });

  it('treats a flick in a direction the key has nothing for as a tap', () => {
    expect(new Finger('q').move(30, 0).release()).toEqual([
      { type: 'text', text: 'q', shifted: 'Q' },
    ]);
  });

  it('sends all four symbols of a flick key', () => {
    expect(new Finger('Pipe').release()).toEqual([text('|')]);
    expect(new Finger('Pipe').move(0, -25).release()).toEqual([text('~')]);
    expect(new Finger('Pipe').move(0, 25).release()).toEqual([text('`')]);
    expect(new Finger('Pipe').move(-25, 3).release()).toEqual([text('<')]);
    expect(new Finger('Pipe').move(25, -3).release()).toEqual([text('>')]);
  });

  it('follows the finger until release, and a return to the centre is a tap', () => {
    const finger = new Finger('Pipe').move(25, 0).move(0, -25);
    expect(finger.gesture.direction).toBe('up');
    expect(finger.move(2, 2).release()).toEqual([text('|')]);
  });

  it('ticks once per flick option it passes', () => {
    const finger = new Finger('Pipe').move(25, 0).move(26, 0);
    expect(finger.haptics).toEqual(['key', 'tick']);
  });

  it('sends Shift+Tab for a flick up on Tab, and Ctrl-C for one on Ctrl', () => {
    expect(new Finger('Tab').move(0, -30).release()).toEqual([
      key({ type: 'key', key: 'shift-tab' }),
    ]);
    expect(new Finger('Control').move(0, -30).release()).toEqual([text('\x03')]);
  });

  it('sends the up secondary after a long press, like Gboard', () => {
    const finger = new Finger('q').wait(TIMING.longPressMs);
    expect(finger.gesture.direction).toBe('up');
    expect(finger.haptics).toEqual(['key', 'tick']);
    expect(finger.release()).toEqual([text('1')]);
  });

  it('has no long press on a key without an up secondary', () => {
    const finger = new Finger('Escape').wait(2000);
    expect(finger.release()).toEqual([key({ type: 'key', key: 'escape' })]);
  });
});

describe('flickDirection', () => {
  it('needs the flick distance', () => {
    const pipe = keyNamed('Pipe');
    expect(flickDirection(pipe, 0, -(TIMING.flickDistance - 1))).toBeNull();
    expect(flickDirection(pipe, 0, -TIMING.flickDistance)).toBe('up');
  });
});

describe('modifiers', () => {
  it('sends a tap on release', () => {
    expect(new Finger('Control').release()).toEqual([{ type: 'modifier', modifier: 'ctrl' }]);
  });

  it('locks on a long press, and releasing sends nothing more', () => {
    const finger = new Finger('Alt').wait(TIMING.longPressMs);
    expect(finger.sent).toEqual([{ type: 'lock', modifier: 'alt' }]);
    expect(finger.haptics).toEqual(['key', 'lock']);
    expect(finger.release()).toEqual([{ type: 'lock', modifier: 'alt' }]);
  });

  it('does nothing on release after a chord', () => {
    const finger = new Finger('Shift');
    finger.gesture = markChorded(finger.gesture);
    expect(finger.wait(2000).release()).toEqual([]);
  });
});

describe('key repeat', () => {
  it('sends once for a tap', () => {
    expect(new Finger('Backspace').release()).toEqual([key({ type: 'key', key: 'backspace' })]);
  });

  it('repeats while held, faster and faster, and sends nothing on release', () => {
    const finger = new Finger('Backspace').wait(TIMING.repeatDelayMs - 1);
    expect(finger.sent).toHaveLength(0);
    finger.wait(1);
    expect(finger.sent).toHaveLength(1);
    finger.wait(1000);
    // 90 ms at first, ramping towards 35 ms.
    expect(finger.sent.length).toBeGreaterThan(1000 / 90);
    expect(finger.sent.length).toBeLessThan(1000 / 35);
    const count = finger.sent.length;
    expect(finger.release()).toHaveLength(count);
  });

  it('speeds up from slow to fast', () => {
    expect(repeatInterval(0)).toBe(TIMING.repeatSlowMs);
    expect(repeatInterval(TIMING.repeatRampMs)).toBe(TIMING.repeatFastMs);
    expect(repeatInterval(10 * TIMING.repeatRampMs)).toBe(TIMING.repeatFastMs);
  });

  it('deletes a word for a flick left on backspace, without repeating', () => {
    expect(new Finger('Backspace').move(-30, 0).wait(2000).release()).toEqual([text('\x17')]);
  });
});

describe('the arrows joystick', () => {
  const left = key({ type: 'key', key: 'left' });
  const right = key({ type: 'key', key: 'right' });
  const up = key({ type: 'key', key: 'up' });

  it('sends the side that was tapped', () => {
    expect(new Finger('Arrow keys', { x: 8, y: 20 }).release()).toEqual([left]);
    expect(new Finger('Arrow keys', { x: 72, y: 22 }).release()).toEqual([right]);
    expect(new Finger('Arrow keys', { x: 44, y: 6 }).release()).toEqual([up]);
  });

  it('sends nothing for a tap dead in the centre', () => {
    expect(new Finger('Arrow keys').release()).toEqual([]);
  });

  it('sends one arrow as soon as the finger leaves the centre', () => {
    const finger = new Finger('Arrow keys').move(TIMING.joystickDeadZone, 0);
    expect(finger.sent).toEqual([right]);
    expect(finger.release()).toEqual([right]);
  });

  it('pumps: each return to the centre and out again is one more arrow', () => {
    const finger = new Finger('Arrow keys').move(0, -14).move(0, -2).move(0, -14).move(0, 0);
    expect(finger.release()).toEqual([up, up]);
  });

  it('repeats while held out, faster further from the centre', () => {
    const near = new Finger('Arrow keys').move(15, 0).wait(1000).release().length;
    const far = new Finger('Arrow keys').move(80, 0).wait(1000).release().length;
    expect(near).toBeGreaterThan(1);
    expect(far).toBeGreaterThan(near * 2);
  });

  it('changes direction when the finger swings round', () => {
    const finger = new Finger('Arrow keys').move(20, 0).move(-20, 0);
    expect(finger.release()).toEqual([right, left]);
  });

  it('holds its direction near a diagonal', () => {
    // Slightly more down than right, but not clearly: still right.
    const finger = new Finger('Arrow keys').move(20, 0).move(18, 20);
    expect(finger.release()).toEqual([right]);
  });

  it('pages after a long press: Home, End, PgUp, PgDn', () => {
    const finger = new Finger('Arrow keys').wait(TIMING.longPressMs);
    expect(finger.gesture.paging).toBe(true);
    expect(finger.haptics).toEqual(['key', 'lock']);
    finger.move(-20, 0).move(0, 0).move(0, 20).wait(TIMING.joystickRepeatDelayMs);
    expect(finger.release()).toEqual([
      key({ type: 'key', key: 'home' }),
      key({ type: 'key', key: 'page-down' }),
      key({ type: 'key', key: 'page-down' }),
    ]);
  });

  it('sends Home and End once, however long they are held', () => {
    const finger = new Finger('Arrow keys').wait(TIMING.longPressMs).move(30, 0).wait(2000);
    expect(finger.release()).toEqual([key({ type: 'key', key: 'end' })]);
  });

  it('gets faster with distance', () => {
    expect(joystickInterval(TIMING.joystickDeadZone)).toBe(TIMING.joystickSlowMs);
    expect(joystickInterval(TIMING.joystickFastDistance)).toBe(TIMING.joystickFastMs);
    expect(joystickInterval(40)).toBeLessThan(TIMING.joystickSlowMs);
  });
});

describe('padTapDirection', () => {
  it('measures sides in proportion, so the short sides still work', () => {
    expect(padTapDirection(RECT, { x: 50, y: 4 })).toBe('up');
    expect(padTapDirection(RECT, { x: 50, y: 37 })).toBe('down');
    expect(padTapDirection(RECT, { x: 66, y: 12 })).toBe('right');
  });
});

describe('the space bar trackpad', () => {
  it('types a space for a tap', () => {
    expect(new Finger('Space').release()).toEqual([text(' ')]);
  });

  it('moves the cursor one arrow per step of travel, and types no space', () => {
    const steps = 3 * TIMING.slideStepX;
    const finger = new Finger('Space').move(steps / 2, 1).move(steps, -2);
    expect(finger.release()).toEqual([
      key({ type: 'key', key: 'right' }),
      key({ type: 'key', key: 'right' }),
      key({ type: 'key', key: 'right' }),
    ]);
  });

  it('goes back and up too', () => {
    const finger = new Finger('Space')
      .move(-TIMING.slideStepX, 0)
      .move(-TIMING.slideStepX, -TIMING.slideStepY);
    expect(finger.release()).toEqual([
      key({ type: 'key', key: 'left' }),
      key({ type: 'key', key: 'up' }),
    ]);
  });
});

describe('commitForRollover', () => {
  it('sends a plain key that is still down', () => {
    const finger = new Finger('q');
    expect(commitForRollover(finger.gesture)?.actions).toEqual([
      { type: 'text', text: 'q', shifted: 'Q' },
    ]);
  });

  it('leaves flicks, modifiers, the joystick and the trackpad alone', () => {
    expect(commitForRollover(new Finger('q').move(0, -30).gesture)).toBeNull();
    expect(commitForRollover(new Finger('Control').gesture)).toBeNull();
    expect(commitForRollover(new Finger('Arrow keys').gesture)).toBeNull();
    expect(commitForRollover(new Finger('Space').gesture)).toBeNull();
  });
});
