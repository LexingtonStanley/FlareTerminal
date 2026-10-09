import {
  afterInput,
  isArmed,
  lockModifier,
  MODIFIERS_OFF,
  nextModifierMode,
  tapModifier,
  toModifiers,
} from './modifiers';

describe('nextModifierMode', () => {
  it('arms a modifier for one key with a tap', () => {
    expect(nextModifierMode('off', { quick: false })).toBe('once');
  });

  it('locks it with a quick second tap, and releases it with a slow one', () => {
    expect(nextModifierMode('once', { quick: true })).toBe('locked');
    expect(nextModifierMode('once', { quick: false })).toBe('off');
  });

  it('unlocks with any tap', () => {
    expect(nextModifierMode('locked', { quick: true })).toBe('off');
    expect(nextModifierMode('locked', { quick: false })).toBe('off');
  });
});

describe('tapModifier and lockModifier', () => {
  it('change only the named modifier', () => {
    const ctrlOnce = tapModifier(MODIFIERS_OFF, 'ctrl');
    expect(ctrlOnce).toEqual({ ctrl: 'once', alt: 'off' });
    expect(tapModifier(ctrlOnce, 'ctrl', { quick: true })).toEqual({ ctrl: 'locked', alt: 'off' });
    expect(lockModifier(ctrlOnce, 'alt')).toEqual({ ctrl: 'once', alt: 'locked' });
  });
});

describe('afterInput', () => {
  it('releases one-shot modifiers and keeps locked ones', () => {
    expect(afterInput({ ctrl: 'once', alt: 'locked' })).toEqual({ ctrl: 'off', alt: 'locked' });
  });

  it('returns the same object when nothing changes', () => {
    const locked = { ctrl: 'locked', alt: 'off' } as const;
    expect(afterInput(locked)).toBe(locked);
    expect(afterInput(MODIFIERS_OFF)).toBe(MODIFIERS_OFF);
  });
});

describe('toModifiers and isArmed', () => {
  it('treat once and locked alike', () => {
    expect(toModifiers({ ctrl: 'once', alt: 'locked' })).toEqual({ ctrl: true, alt: true });
    expect(toModifiers(MODIFIERS_OFF)).toEqual({ ctrl: false, alt: false });
    expect(isArmed({ ctrl: 'off', alt: 'locked' })).toBe(true);
    expect(isArmed(MODIFIERS_OFF)).toBe(false);
  });
});
