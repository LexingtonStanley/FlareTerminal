import type { Point, Rect } from './geometry';
import {
  ARROW_KEYS,
  DIRECTIONS,
  PAGE_KEYS,
  type Direction,
  type KeyAction,
  type KeyDef,
} from './layout';

/**
 * What one finger does on one key, as a pure state machine: `beginGesture` on touch
 * down, `moveGesture` as it moves, `tickGesture` when `gesture.nextAt` comes due
 * (long press, key repeat), `endGesture` on release. Each step returns the actions to
 * perform, so the component only routes touches and timers. Times are milliseconds.
 */

export const TIMING = {
  /** Travel that turns a tap into a flick (a secondary character or key). */
  flickDistance: 18,
  /** Holding still this long sends the up secondary, locks a modifier, or pages the arrows. */
  longPressMs: 450,
  /** Held backspace and nav keys: delay, then an interval that speeds up over `repeatRampMs`. */
  repeatDelayMs: 400,
  repeatSlowMs: 90,
  repeatFastMs: 35,
  repeatRampMs: 1500,
  /** The arrows joystick: distance before an arrow, then hold off-centre to repeat. */
  joystickDeadZone: 12,
  /** Once moving, the finger must come closer than this to stop (hysteresis). */
  joystickReleaseZone: 8,
  joystickRepeatDelayMs: 320,
  /** Repeat interval just outside the dead zone, and at `joystickFastDistance` or beyond. */
  joystickSlowMs: 160,
  joystickFastMs: 30,
  joystickFastDistance: 80,
  /** The space bar trackpad: travel before sliding starts, then travel per arrow. */
  slideStartDistance: 12,
  slideStepX: 12,
  slideStepY: 22,
} as const;

export type GesturePhase =
  /** Down, nothing decided yet. */
  | 'pressed'
  /** A long press fired: up secondary chosen, modifier locked, or arrows paging. */
  | 'held'
  /** Sending repeatedly: a held backspace, or the joystick off-centre. */
  | 'repeating'
  /** Space bar trackpad. */
  | 'sliding'
  | 'ended';

export type Gesture = {
  key: KeyDef;
  rect: Rect;
  start: Point;
  current: Point;
  startedAt: number;
  phase: GesturePhase;
  /** The flick that releasing would send, or the direction the joystick is held in. */
  direction: Direction | null;
  /** When `tickGesture` should next run; null when no timer is needed. */
  nextAt: number | null;
  repeatStartedAt: number | null;
  /** Space bar: where the next trackpad step is measured from. */
  anchor: Point;
  /** Something was already sent while held, so releasing sends nothing more. */
  sent: boolean;
  /** Arrows key after a long press: Home/End/PgUp/PgDn instead of arrows. */
  paging: boolean;
  /** A modifier held down while another key was pressed: releasing it changes nothing. */
  chorded: boolean;
};

/** Feedback for the step: a key went down, a detent (flick, arrow step), or a lock. */
export type Haptic = 'key' | 'tick' | 'lock';

export type GestureStep = { gesture: Gesture; actions: KeyAction[]; haptic: Haptic | null };

const UNIT: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// A flick may be up to 60° off its direction, so a sloppy diagonal still counts.
const FLICK_CONE = Math.cos(Math.PI / 3);

/** The secondary a flick of (dx, dy) selects on this key, or null for a tap. */
export function flickDirection(key: KeyDef, dx: number, dy: number): Direction | null {
  const distance = Math.hypot(dx, dy);
  if (distance < TIMING.flickDistance) return null;
  let best: Direction | null = null;
  let bestScore = FLICK_CONE;
  for (const direction of DIRECTIONS) {
    if (!key.flicks[direction]) continue;
    const score = (dx * UNIT[direction].x + dy * UNIT[direction].y) / distance;
    if (score > bestScore) {
      best = direction;
      bestScore = score;
    }
  }
  return best;
}

export function dominantDirection(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * The arrows key's tap: the side of the key that was tapped, measured from the centre
 * in proportion to the key's size, so the short up and down sides stay usable. The
 * centre does nothing.
 */
export function padTapDirection(rect: Rect, point: Point): Direction | null {
  const nx = (point.x - (rect.x + rect.width / 2)) / (rect.width / 2);
  const ny = (point.y - (rect.y + rect.height / 2)) / (rect.height / 2);
  if (Math.abs(nx) < 0.15 && Math.abs(ny) < 0.15) return null;
  return dominantDirection(nx, ny);
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * Math.min(1, Math.max(0, t));
}

/** Time to the next repeat of a held key, `elapsed` ms after repeating began. */
export function repeatInterval(elapsed: number): number {
  return Math.round(lerp(TIMING.repeatSlowMs, TIMING.repeatFastMs, elapsed / TIMING.repeatRampMs));
}

/** Time to the next joystick arrow: the further from the centre, the faster. */
export function joystickInterval(distance: number): number {
  const t =
    (distance - TIMING.joystickDeadZone) / (TIMING.joystickFastDistance - TIMING.joystickDeadZone);
  return Math.round(lerp(TIMING.joystickSlowMs, TIMING.joystickFastMs, t));
}

function step(gesture: Gesture, actions: KeyAction[] = [], haptic: Haptic | null = null) {
  return { gesture, actions, haptic };
}

function arrow(direction: Direction, paging = false): KeyAction {
  return { type: 'key', key: (paging ? PAGE_KEYS : ARROW_KEYS)[direction] };
}

function tapActions(key: KeyDef): KeyAction[] {
  return key.tap ? [key.tap] : [];
}

function secondaryActions(key: KeyDef, direction: Direction): KeyAction[] {
  const secondary = key.flicks[direction];
  return secondary ? [secondary.action] : [];
}

function firstDeadline(key: KeyDef, now: number): number | null {
  switch (key.behavior) {
    case 'press':
      return key.flicks.up ? now + TIMING.longPressMs : null;
    case 'repeat':
      return now + TIMING.repeatDelayMs;
    case 'modifier':
    case 'arrows':
      return now + TIMING.longPressMs;
    case 'space':
      return null;
  }
}

export function beginGesture(key: KeyDef, rect: Rect, point: Point, now: number): GestureStep {
  return step(
    {
      key,
      rect,
      start: point,
      current: point,
      startedAt: now,
      phase: 'pressed',
      direction: null,
      nextAt: firstDeadline(key, now),
      repeatStartedAt: null,
      anchor: point,
      sent: false,
      paging: false,
      chorded: false,
    },
    [],
    'key'
  );
}

function moveFlick(gesture: Gesture): GestureStep {
  const { key, phase } = gesture;
  if (phase === 'repeating') return step(gesture);
  if (key.behavior === 'modifier' && phase !== 'pressed') return step(gesture);
  const dx = gesture.current.x - gesture.start.x;
  const dy = gesture.current.y - gesture.start.y;
  let direction = flickDirection(key, dx, dy);
  // After a long press picked the up secondary, small movements keep it.
  if (direction === null && phase === 'held') direction = gesture.direction;
  if (direction === gesture.direction) return step(gesture);
  return step(
    {
      ...gesture,
      direction,
      // Flicking cancels the long press and the key repeat.
      nextAt: direction !== null && phase === 'pressed' ? null : gesture.nextAt,
    },
    [],
    direction ? 'tick' : null
  );
}

function moveJoystick(gesture: Gesture, now: number): GestureStep {
  const dx = gesture.current.x - gesture.start.x;
  const dy = gesture.current.y - gesture.start.y;
  const distance = Math.hypot(dx, dy);
  const zone = gesture.direction ? TIMING.joystickReleaseZone : TIMING.joystickDeadZone;
  let direction = distance >= zone ? dominantDirection(dx, dy) : null;

  // Near a diagonal, keep the current direction until the other axis clearly wins.
  if (direction && gesture.direction && direction !== gesture.direction) {
    const along = dx * UNIT[gesture.direction].x + dy * UNIT[gesture.direction].y;
    const across = Math.max(Math.abs(dx), Math.abs(dy));
    if (along > 0.75 * across) direction = gesture.direction;
  }
  if (direction === gesture.direction) return step(gesture);

  if (direction === null) {
    return step({ ...gesture, direction: null, nextAt: null });
  }
  // Paging Home and End once; arrows, PgUp and PgDn repeat while held.
  const repeats = !(gesture.paging && (direction === 'left' || direction === 'right'));
  return step(
    {
      ...gesture,
      direction,
      phase: gesture.paging ? 'held' : 'repeating',
      sent: true,
      nextAt: repeats ? now + TIMING.joystickRepeatDelayMs : null,
    },
    [arrow(direction, gesture.paging)],
    'tick'
  );
}

function moveSlide(gesture: Gesture): GestureStep {
  let current = gesture;
  const { x, y } = gesture.current;
  if (current.phase === 'pressed') {
    const travel = Math.hypot(x - gesture.start.x, y - gesture.start.y);
    if (travel < TIMING.slideStartDistance) return step(gesture);
    current = { ...current, phase: 'sliding', anchor: gesture.start, sent: true };
  }

  const actions: KeyAction[] = [];
  let anchor = current.anchor;
  for (;;) {
    const ax = x - anchor.x;
    const ay = y - anchor.y;
    if (Math.abs(ax) >= Math.abs(ay) && Math.abs(ax) >= TIMING.slideStepX) {
      actions.push(arrow(ax > 0 ? 'right' : 'left'));
      // Each step forgets the drift across it, so a wobbly line stays horizontal.
      anchor = { x: anchor.x + Math.sign(ax) * TIMING.slideStepX, y };
    } else if (Math.abs(ay) > Math.abs(ax) && Math.abs(ay) >= TIMING.slideStepY) {
      actions.push(arrow(ay > 0 ? 'down' : 'up'));
      anchor = { x, y: anchor.y + Math.sign(ay) * TIMING.slideStepY };
    } else {
      break;
    }
  }
  return step({ ...current, anchor }, actions, actions.length > 0 ? 'tick' : null);
}

export function moveGesture(gesture: Gesture, point: Point, now: number): GestureStep {
  if (gesture.phase === 'ended') return step(gesture);
  const moved = { ...gesture, current: point };
  switch (gesture.key.behavior) {
    case 'arrows':
      return moveJoystick(moved, now);
    case 'space':
      return moveSlide(moved);
    default:
      return moveFlick(moved);
  }
}

export function tickGesture(gesture: Gesture, now: number): GestureStep {
  const { key, phase, nextAt, direction } = gesture;
  if (phase === 'ended' || nextAt === null || now < nextAt) return step(gesture);

  switch (key.behavior) {
    case 'press':
      // Long press: the up secondary, as Gboard does for its symbol hints.
      if (phase === 'pressed' && direction === null && key.flicks.up) {
        return step({ ...gesture, phase: 'held', direction: 'up', nextAt: null }, [], 'tick');
      }
      break;
    case 'modifier':
      if (phase === 'pressed' && direction === null && !gesture.chorded && key.tap) {
        const modifier = key.tap.type === 'modifier' ? key.tap.modifier : null;
        if (modifier) {
          return step(
            { ...gesture, phase: 'held', nextAt: null },
            [{ type: 'lock', modifier }],
            'lock'
          );
        }
      }
      break;
    case 'repeat':
      if (direction === null) {
        const startedAt = gesture.repeatStartedAt ?? now;
        return step(
          {
            ...gesture,
            phase: 'repeating',
            sent: true,
            repeatStartedAt: startedAt,
            nextAt: now + repeatInterval(now - startedAt),
          },
          tapActions(key)
        );
      }
      break;
    case 'arrows':
      if (direction === null && !gesture.sent && !gesture.paging) {
        return step({ ...gesture, phase: 'held', paging: true, nextAt: null }, [], 'lock');
      }
      if (direction !== null) {
        const distance = Math.hypot(
          gesture.current.x - gesture.start.x,
          gesture.current.y - gesture.start.y
        );
        return step({ ...gesture, nextAt: now + joystickInterval(distance) }, [
          arrow(direction, gesture.paging),
        ]);
      }
      break;
    case 'space':
      break;
  }
  return step({ ...gesture, nextAt: null });
}

export function endGesture(gesture: Gesture, point: Point, now: number): GestureStep {
  if (gesture.phase === 'ended') return step(gesture);
  const moved = moveGesture(gesture, point, now);
  const final = moved.gesture;
  const { key, direction, phase } = final;
  let actions: KeyAction[] = [];

  switch (key.behavior) {
    case 'press':
      actions = direction ? secondaryActions(key, direction) : tapActions(key);
      break;
    case 'repeat':
      if (!final.sent) actions = direction ? secondaryActions(key, direction) : tapActions(key);
      break;
    case 'modifier':
      if (direction && phase === 'pressed') actions = secondaryActions(key, direction);
      else if (phase === 'pressed' && !final.chorded) actions = tapActions(key);
      break;
    case 'arrows':
      if (!final.sent && !final.paging) {
        const side = padTapDirection(final.rect, final.start);
        if (side) actions = [arrow(side)];
      }
      break;
    case 'space':
      if (phase === 'pressed') actions = tapActions(key);
      break;
  }
  return step({ ...final, phase: 'ended', nextAt: null }, [...moved.actions, ...actions]);
}

/**
 * Another finger came down. Like a phone keyboard, a plain key still waiting for its
 * release is sent now, so fast two-thumb typing keeps its order. Returns null for
 * gestures that must keep going (flicks, repeats, modifiers, the joystick, sliding).
 */
export function commitForRollover(gesture: Gesture): GestureStep | null {
  const { key, phase, direction } = gesture;
  if (key.behavior !== 'press' && key.behavior !== 'repeat') return null;
  if (phase !== 'pressed' || direction !== null || gesture.sent) return null;
  return step({ ...gesture, phase: 'ended', nextAt: null }, tapActions(key));
}

/** A held modifier that another key used: releasing it must not toggle it. */
export function markChorded(gesture: Gesture): Gesture {
  return gesture.chorded ? gesture : { ...gesture, chorded: true, nextAt: null };
}
