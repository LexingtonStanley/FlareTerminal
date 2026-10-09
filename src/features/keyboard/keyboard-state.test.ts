import {
  INITIAL_KEYBOARD,
  NOTHING_HELD,
  resolveAction,
  type KeyboardState,
  type ResolveContext,
} from './keyboard-state';
import type { KeyAction } from './layout';
import { DOUBLE_TAP_MS, MODIFIERS_OFF } from './modifiers';

function context(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    keyId: 'key',
    now: 10_000,
    keyboard: INITIAL_KEYBOARD,
    modifiers: MODIFIERS_OFF,
    held: NOTHING_HELD,
    ...overrides,
  };
}

const Q: KeyAction = { type: 'text', text: 'q', shifted: 'Q' };
const TAB: KeyAction = { type: 'key', key: 'tab', shifted: 'shift-tab' };
const SHIFT: KeyAction = { type: 'modifier', modifier: 'shift' };
const CTRL: KeyAction = { type: 'modifier', modifier: 'ctrl' };

describe('resolveAction', () => {
  it('types text', () => {
    expect(resolveAction(Q, context()).effects).toEqual([{ type: 'text', text: 'q' }]);
  });

  it('types a capital with one-shot Shift, then releases it', () => {
    const shifted: KeyboardState = { ...INITIAL_KEYBOARD, shift: 'once' };
    const result = resolveAction(Q, context({ keyboard: shifted }));
    expect(result.effects).toEqual([{ type: 'text', text: 'Q' }]);
    expect(result.keyboard.shift).toBe('off');
  });

  it('keeps caps lock on', () => {
    const locked: KeyboardState = { ...INITIAL_KEYBOARD, shift: 'locked' };
    const result = resolveAction(Q, context({ keyboard: locked }));
    expect(result.effects).toEqual([{ type: 'text', text: 'Q' }]);
    expect(result.keyboard).toBe(locked);
  });

  it('types a capital while Shift is held down', () => {
    const held = { ...NOTHING_HELD, shift: true };
    expect(resolveAction(Q, context({ held })).effects).toEqual([{ type: 'text', text: 'Q' }]);
  });

  it('sends Shift+Tab for Tab with Shift on', () => {
    const shifted: KeyboardState = { ...INITIAL_KEYBOARD, shift: 'once' };
    const result = resolveAction(TAB, context({ keyboard: shifted }));
    expect(result.effects).toEqual([{ type: 'key', key: 'shift-tab' }]);
    expect(result.keyboard.shift).toBe('off');
  });

  it("doesn't spend Shift on keys it doesn't change", () => {
    const shifted: KeyboardState = { ...INITIAL_KEYBOARD, shift: 'once' };
    const result = resolveAction({ type: 'key', key: 'left' }, context({ keyboard: shifted }));
    expect(result.effects).toEqual([{ type: 'key', key: 'left' }]);
    expect(result.keyboard.shift).toBe('once');
  });

  it('applies a held Ctrl or Alt itself (a chord)', () => {
    const held = { ...NOTHING_HELD, ctrl: true, alt: true };
    expect(resolveAction(Q, context({ held })).effects).toEqual([
      { type: 'text', text: '\x1b\x11' },
    ]);
  });

  it('leaves an armed modifier to the session, even when its key is also held', () => {
    const held = { ...NOTHING_HELD, ctrl: true };
    const modifiers = { ctrl: 'once', alt: 'off' } as const;
    expect(resolveAction(Q, context({ held, modifiers })).effects).toEqual([
      { type: 'text', text: 'q' },
    ]);
  });

  it('arms Ctrl with a tap, locks it with a quick second tap', () => {
    const first = resolveAction(CTRL, context({ keyId: 'ctrl' }));
    expect(first.effects).toEqual([{ type: 'modifiers', modifiers: { ctrl: 'once', alt: 'off' } }]);
    expect(first.locked).toBe(false);

    const second = resolveAction(
      CTRL,
      context({
        keyId: 'ctrl',
        now: 10_000 + DOUBLE_TAP_MS - 1,
        keyboard: first.keyboard,
        modifiers: { ctrl: 'once', alt: 'off' },
      })
    );
    expect(second.effects).toEqual([
      { type: 'modifiers', modifiers: { ctrl: 'locked', alt: 'off' } },
    ]);
    expect(second.locked).toBe(true);
  });

  it('releases Ctrl with a slow second tap', () => {
    const first = resolveAction(CTRL, context({ keyId: 'ctrl' }));
    const second = resolveAction(
      CTRL,
      context({
        keyId: 'ctrl',
        now: 10_000 + DOUBLE_TAP_MS,
        keyboard: first.keyboard,
        modifiers: { ctrl: 'once', alt: 'off' },
      })
    );
    expect(second.effects).toEqual([{ type: 'modifiers', modifiers: MODIFIERS_OFF }]);
  });

  it('cycles Shift through once and caps lock', () => {
    const once = resolveAction(SHIFT, context({ keyId: 'shift' }));
    expect(once.keyboard.shift).toBe('once');
    const locked = resolveAction(
      SHIFT,
      context({ keyId: 'shift', now: 10_100, keyboard: once.keyboard })
    );
    expect(locked.keyboard.shift).toBe('locked');
    expect(locked.locked).toBe(true);
    const off = resolveAction(
      SHIFT,
      context({ keyId: 'shift', now: 20_000, keyboard: locked.keyboard })
    );
    expect(off.keyboard.shift).toBe('off');
  });

  it('locks a modifier from a long press', () => {
    expect(resolveAction({ type: 'lock', modifier: 'alt' }, context()).effects).toEqual([
      { type: 'modifiers', modifiers: { ctrl: 'off', alt: 'locked' } },
    ]);
    expect(resolveAction({ type: 'lock', modifier: 'shift' }, context()).keyboard.shift).toBe(
      'locked'
    );
  });

  it('switches layers and keyboards', () => {
    expect(resolveAction({ type: 'layer', layer: 'nav' }, context()).keyboard.layer).toBe('nav');
    expect(resolveAction({ type: 'switch', to: 'system' }, context()).effects).toEqual([
      { type: 'switch', to: 'system' },
    ]);
  });
});
