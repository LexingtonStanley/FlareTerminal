import { hitTest, type PlacedKey, type Point } from './geometry';
import {
  beginGesture,
  commitForRollover,
  endGesture,
  markChorded,
  moveGesture,
  tickGesture,
  type Gesture,
  type GestureStep,
  type Haptic,
} from './gestures';
import { NOTHING_HELD, type HeldModifiers } from './keyboard-state';
import type { Direction, KeyAction } from './layout';

/** One finger on the keyboard surface, in surface coordinates. */
export type TouchPoint = Point & { id: string };

/** What a pressed key shows: for the key cap highlight, flick hints and the bubble. */
export type ActiveKey = {
  keyId: string;
  startedAt: number;
  direction: Direction | null;
  paging: boolean;
  offset: Point;
};

export type TrackerOutput = {
  onAction(action: KeyAction, source: { keyId: string; held: HeldModifiers }): void;
  onActiveChange(active: ActiveKey[]): void;
  onHaptic(kind: Haptic): void;
};

type Clock = {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

const SYSTEM_CLOCK: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Routes every finger on a keyboard surface to its own gesture: hit-tests touch downs
 * against the placed keys, feeds moves and releases to gestures.ts, runs the timers
 * gestures ask for, and reports actions. Several fingers at once work: two-thumb
 * typing (rollover sends a waiting key when the next one goes down), and chords
 * (hold Ctrl with one thumb, tap C with the other).
 */
export class TouchTracker {
  private gestures = new Map<string, Gesture>();
  private timer: unknown = null;
  private keys: PlacedKey[] = [];
  private lastActive = '[]';

  constructor(
    private output: TrackerOutput,
    private clock: Clock = SYSTEM_CLOCK
  ) {}

  /** The keys as currently laid out, and where to send output. */
  update(keys: PlacedKey[], output: TrackerOutput) {
    this.keys = keys;
    this.output = output;
  }

  start(touches: TouchPoint[]) {
    const now = this.clock.now();
    for (const touch of touches) {
      const hit = hitTest(this.keys, touch);
      if (!hit) continue;
      const stale = this.gestures.get(touch.id);
      if (stale) this.apply(touch.id, endGesture(stale, stale.current, now));
      for (const [id, gesture] of this.gestures) {
        const committed = commitForRollover(gesture);
        if (committed) this.apply(id, committed);
      }
      this.apply(touch.id, beginGesture(hit.key, hit.rect, touch, now));
    }
    this.refresh();
  }

  move(touches: TouchPoint[]) {
    const now = this.clock.now();
    for (const touch of touches) {
      const gesture = this.gestures.get(touch.id);
      if (gesture) this.apply(touch.id, moveGesture(gesture, touch, now));
    }
    this.refresh();
  }

  end(touches: TouchPoint[]) {
    const now = this.clock.now();
    for (const touch of touches) {
      const gesture = this.gestures.get(touch.id);
      if (gesture) this.apply(touch.id, endGesture(gesture, touch, now));
    }
    this.refresh();
  }

  /** The last finger lifted: end it, and anything whose release went missing. */
  release(touches: TouchPoint[]) {
    this.end(touches);
    const now = this.clock.now();
    for (const [id, gesture] of this.gestures) {
      this.apply(id, endGesture(gesture, gesture.current, now));
    }
    this.refresh();
  }

  /** The system took the touches (an edge swipe, an incoming call): send nothing. */
  cancel() {
    this.gestures.clear();
    this.refresh();
  }

  dispose() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.gestures.clear();
  }

  private heldModifiers(source: Gesture, isOutput: boolean): HeldModifiers {
    const held = { ...NOTHING_HELD };
    for (const [id, gesture] of this.gestures) {
      if (gesture === source || gesture.key.tap?.type !== 'modifier') continue;
      held[gesture.key.tap.modifier] = true;
      // Releasing a modifier that took part in a chord must not toggle it.
      if (isOutput) this.gestures.set(id, markChorded(gesture));
    }
    return held;
  }

  private apply(id: string, result: GestureStep) {
    if (result.gesture.phase === 'ended') this.gestures.delete(id);
    else this.gestures.set(id, result.gesture);
    if (result.haptic) this.output.onHaptic(result.haptic);
    for (const action of result.actions) {
      const isOutput = action.type === 'text' || action.type === 'key';
      const held = this.heldModifiers(result.gesture, isOutput);
      this.output.onAction(action, { keyId: result.gesture.key.id, held });
    }
  }

  private tick = () => {
    this.timer = null;
    const now = this.clock.now();
    for (const [id, gesture] of this.gestures) {
      if (gesture.nextAt !== null && gesture.nextAt <= now)
        this.apply(id, tickGesture(gesture, now));
    }
    this.refresh();
  };

  private refresh() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    const gestures = [...this.gestures.values()];
    const deadlines = gestures.flatMap((gesture) =>
      gesture.nextAt === null ? [] : [gesture.nextAt]
    );
    if (deadlines.length > 0) {
      const delay = Math.max(0, Math.min(...deadlines) - this.clock.now());
      this.timer = this.clock.setTimeout(this.tick, delay);
    }

    const active: ActiveKey[] = gestures.map((gesture) => ({
      keyId: gesture.key.id,
      startedAt: gesture.startedAt,
      direction: gesture.direction,
      paging: gesture.paging,
      offset: { x: gesture.current.x - gesture.start.x, y: gesture.current.y - gesture.start.y },
    }));
    const serialized = JSON.stringify(active);
    if (serialized !== this.lastActive) {
      this.lastActive = serialized;
      this.output.onActiveChange(active);
    }
  }
}
