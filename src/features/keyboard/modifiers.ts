import type { Modifiers } from '@/features/terminal/keys';

/**
 * Sticky modifiers, as on Unexpected Keyboard and iOS's Shift key:
 *
 *   off ──tap──▶ once ──quick second tap (or long press)──▶ locked
 *    ▲            │ next key, or a slow second tap            │
 *    └────────────┴───────────────────tap─────────────────────┘
 *
 * "once" applies to the next key only; "locked" stays until tapped again.
 */
export type ModifierMode = 'off' | 'once' | 'locked';

export type ModifierName = keyof Modifiers;

export type ModifierState = Record<ModifierName, ModifierMode>;

export const MODIFIERS_OFF: ModifierState = { ctrl: 'off', alt: 'off' };

/** A second tap within this window locks a modifier instead of releasing it. */
export const DOUBLE_TAP_MS = 350;

/** The boolean view that `applyModifiers` and the composer take. */
export function toModifiers(state: ModifierState): Modifiers {
  return { ctrl: state.ctrl !== 'off', alt: state.alt !== 'off' };
}

export function isArmed(state: ModifierState): boolean {
  return state.ctrl !== 'off' || state.alt !== 'off';
}

/** The next mode after a tap on a modifier key. */
export function nextModifierMode(mode: ModifierMode, { quick }: { quick: boolean }): ModifierMode {
  switch (mode) {
    case 'off':
      return 'once';
    case 'once':
      return quick ? 'locked' : 'off';
    case 'locked':
      return 'off';
  }
}

/** Taps a modifier key. `quick` is true for the second tap of a double tap. */
export function tapModifier(
  state: ModifierState,
  name: ModifierName,
  { quick = false }: { quick?: boolean } = {}
): ModifierState {
  return { ...state, [name]: nextModifierMode(state[name], { quick }) };
}

export function lockModifier(state: ModifierState, name: ModifierName): ModifierState {
  return { ...state, [name]: 'locked' };
}

/**
 * The state after a key has used the modifiers: one-shot modifiers release, locked ones
 * stay. Returns the same object when nothing changes, so it is safe to set as React state.
 */
export function afterInput(state: ModifierState): ModifierState {
  if (state.ctrl !== 'once' && state.alt !== 'once') return state;
  return {
    ctrl: state.ctrl === 'once' ? 'off' : state.ctrl,
    alt: state.alt === 'once' ? 'off' : state.alt,
  };
}
