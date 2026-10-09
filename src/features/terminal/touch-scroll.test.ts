import { scrollModeOf, TouchScroller } from './touch-scroll';

/** A scroller with 20-pixel steps, a hand-driven frame clock and a log of its steps. */
function setup() {
  const steps: number[] = [];
  let frame: ((time: number) => void) | null = null;
  const scroller = new TouchScroller({
    stepSize: () => 20,
    onScroll: (count) => steps.push(count),
    requestFrame: (callback) => {
      frame = callback;
      return () => {
        frame = null;
      };
    },
  });
  /** Runs frames 16 ms apart until the fling stops (or a limit, so a bug can't hang). */
  const runFrames = (from: number) => {
    let time = from;
    for (let i = 0; frame && i < 1000; i++) {
      const next = frame;
      frame = null;
      time += 16;
      next(time);
    }
    return time;
  };
  return { scroller, steps, runFrames, flinging: () => frame !== null };
}

const total = (steps: number[]) => steps.reduce((sum, step) => sum + step, 0);

describe('scrollModeOf', () => {
  it('scrolls the scrollback on the normal screen', () => {
    expect(scrollModeOf({ buffer: 'normal', mouseTracking: 'none' })).toBe('scrollback');
  });

  it('sends the wheel to programs that read it (tmux with mouse on, zellij)', () => {
    for (const mouseTracking of ['vt200', 'drag', 'any'] as const) {
      expect(scrollModeOf({ buffer: 'alternate', mouseTracking })).toBe('wheel');
      expect(scrollModeOf({ buffer: 'normal', mouseTracking })).toBe('wheel');
    }
  });

  it('leaves a full-screen program that doesn’t read the wheel alone', () => {
    expect(scrollModeOf({ buffer: 'alternate', mouseTracking: 'none' })).toBe('none');
    // X10 reports presses only.
    expect(scrollModeOf({ buffer: 'alternate', mouseTracking: 'x10' })).toBe('none');
  });
});

describe('TouchScroller', () => {
  it('scrolls back a step for each step the finger moves down, carrying the rest', () => {
    const { scroller, steps } = setup();

    scroller.start(100, 0);
    scroller.move(115, 1000);
    expect(steps).toEqual([]);
    scroller.move(145, 2000);
    scroller.move(165, 3000);

    expect(steps).toEqual([-2, -1]);
  });

  it('scrolls forward when the finger moves up', () => {
    const { scroller, steps } = setup();

    scroller.start(300, 0);
    scroller.move(240, 1000);

    expect(steps).toEqual([3]);
  });

  it('keeps going after a quick lift, slowing to a stop', () => {
    const { scroller, steps, runFrames, flinging } = setup();

    scroller.start(100, 0);
    for (let i = 1; i <= 5; i++) scroller.move(100 + i * 20, i * 10);
    scroller.end(50);
    const dragged = total(steps);
    expect(dragged).toBe(-5);
    expect(flinging()).toBe(true);

    const end = runFrames(50);

    expect(flinging()).toBe(false);
    // Further than the drag went, the same way, and not forever.
    expect(total(steps)).toBeLessThan(dragged - 10);
    expect(steps.every((step) => step < 0)).toBe(true);
    expect(end).toBeLessThan(50 + 16 * 400);
  });

  it('just stops after a slow lift or a pause', () => {
    const { scroller, steps, flinging } = setup();

    scroller.start(100, 0);
    scroller.move(140, 1000);
    scroller.end(1100);
    expect(flinging()).toBe(false);

    scroller.start(100, 2000);
    scroller.move(160, 2020);
    // Held still before lifting: no speed left.
    scroller.end(2500);
    expect(flinging()).toBe(false);
    expect(steps).toEqual([-2, -3]);
  });

  it('stops a fling when the finger lands again', () => {
    const { scroller, steps, flinging } = setup();

    scroller.start(100, 0);
    for (let i = 1; i <= 5; i++) scroller.move(100 + i * 20, i * 10);
    scroller.end(50);
    expect(flinging()).toBe(true);

    scroller.start(400, 60);

    expect(flinging()).toBe(false);
    expect(total(steps)).toBe(-5);
  });

  it('does nothing until the terminal has a size', () => {
    const steps: number[] = [];
    const scroller = new TouchScroller({
      stepSize: () => 0,
      onScroll: (count) => steps.push(count),
      requestFrame: () => () => {},
    });

    scroller.start(0, 0);
    scroller.move(500, 10);

    expect(steps).toEqual([]);
  });
});
