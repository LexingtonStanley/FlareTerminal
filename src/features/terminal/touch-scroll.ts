/**
 * Scrolling the terminal with a finger. xterm.js 6 only scrolls for a mouse wheel, so the
 * view turns a vertical drag (and the fling after it) into scrolling itself:
 * - the terminal's own scrollback, for a shell or an agent drawing on the normal screen;
 * - wheel reports, for a program that reads the mouse (tmux with mouse on, zellij, vim with
 *   mouse=a): tmux and zellij then scroll their own history;
 * - nothing, for a full-screen program that doesn't read the mouse. A desktop terminal sends
 *   it arrow keys, but an agent would take those as moves through its prompt history.
 */

export type ScrollMode = 'scrollback' | 'wheel' | 'none';

/** The parts of xterm.js's state that decide where a drag goes. */
export type ScrollState = {
  buffer: 'normal' | 'alternate';
  /** xterm.js's `modes.mouseTrackingMode`. */
  mouseTracking: 'none' | 'x10' | 'vt200' | 'drag' | 'any';
};

export function scrollModeOf({ buffer, mouseTracking }: ScrollState): ScrollMode {
  // X10 reporting has presses only, no wheel.
  if (mouseTracking !== 'none' && mouseTracking !== 'x10') return 'wheel';
  return buffer === 'normal' ? 'scrollback' : 'none';
}

/** Lines one wheel report stands for: zellij scrolls 3 per report, tmux 5. */
export const WHEEL_LINES = 3;

/** Below this speed (pixels per millisecond) a lifted finger just stops. */
const FLING_MIN_SPEED = 0.3;
const FLING_STOP_SPEED = 0.02;
/** How much speed a fling keeps per 16 ms frame. */
const FLING_DECAY = 0.95;
/** Moves older than this don't count towards the speed at lift-off. */
const VELOCITY_WINDOW_MS = 100;

export type TouchScrollerOptions = {
  /** Pixels of travel per step: a line's height, or WHEEL_LINES of them. */
  stepSize(): number;
  /** Whole steps to scroll; negative goes back in history (the finger moved down). */
  onScroll(steps: number): void;
  /** Runs the callback on the next frame; returns a way to cancel it. */
  requestFrame(callback: (time: number) => void): () => void;
};

/**
 * Turns one finger's vertical travel into whole steps, carrying the remainder, and keeps
 * going after a quick lift-off, slowing down like a native list. Pure: the view feeds it
 * pointer positions and times, and a frame scheduler.
 */
export class TouchScroller {
  private lastY = 0;
  private remainder = 0;
  private samples: { y: number; time: number }[] = [];
  private stopFling: (() => void) | null = null;

  constructor(private readonly options: TouchScrollerOptions) {}

  start(y: number, time: number) {
    this.cancel();
    this.lastY = y;
    this.remainder = 0;
    this.samples = [{ y, time }];
  }

  move(y: number, time: number) {
    this.travel(y - this.lastY);
    this.lastY = y;
    this.samples.push({ y, time });
    this.samples = this.samples.filter((sample) => time - sample.time <= VELOCITY_WINDOW_MS);
  }

  /** The finger lifted: a fling if it was moving fast enough. */
  end(time: number) {
    const recent = this.samples.filter((sample) => time - sample.time <= VELOCITY_WINDOW_MS);
    this.samples = [];
    if (recent.length < 2) return;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const elapsed = Math.max(last.time - first.time, 1);
    let speed = (last.y - first.y) / elapsed;
    if (Math.abs(speed) < FLING_MIN_SPEED) return;

    let previous = time;
    const frame = (now: number) => {
      const elapsed = Math.max(now - previous, 0);
      previous = now;
      this.travel(speed * elapsed);
      speed *= FLING_DECAY ** (elapsed / 16);
      this.stopFling = Math.abs(speed) < FLING_STOP_SPEED ? null : this.options.requestFrame(frame);
    };
    this.stopFling = this.options.requestFrame(frame);
  }

  /** Stops a fling: another touch, or the view going away. */
  cancel() {
    this.stopFling?.();
    this.stopFling = null;
  }

  private travel(pixels: number) {
    const size = this.options.stepSize();
    if (!(size > 0)) return;
    this.remainder += pixels / size;
    const steps = Math.trunc(this.remainder);
    if (steps === 0) return;
    this.remainder -= steps;
    // A finger moving down pulls older lines into view.
    this.options.onScroll(-steps);
  }
}
