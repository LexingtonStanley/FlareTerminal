import { applyModifiers, type SpecialKey } from '@/features/terminal/keys';

import type { KeyAction, LayerId } from './layout';
import {
  DOUBLE_TAP_MS,
  lockModifier,
  nextModifierMode,
  tapModifier,
  type ModifierMode,
  type ModifierState,
} from './modifiers';

/**
 * Turns key actions into what the app does: text and keys to send, modifier changes,
 * layer and Shift changes, and requests to switch keyboards. Pure, so the component
 * only calls the props it returns.
 *
 * Ctrl and Alt belong to the terminal session (the composer and the terminal's own
 * keyboard use them too), so they arrive as props and leave through onModifiersChange;
 * the session applies them to the next input and releases one-shot ones. Shift and the
 * layer are the keyboard's own.
 */

export type KeyboardState = {
  layer: LayerId;
  shift: ModifierMode;
  /** The last modifier tap, to recognise a double tap. */
  lastTap: { keyId: string; at: number } | null;
};

export const INITIAL_KEYBOARD: KeyboardState = { layer: 'letters', shift: 'off', lastTap: null };

/** Modifier keys currently held down by another finger (a chord, as on a hardware keyboard). */
export type HeldModifiers = { ctrl: boolean; alt: boolean; shift: boolean };

export const NOTHING_HELD: HeldModifiers = { ctrl: false, alt: false, shift: false };

export type Effect =
  | { type: 'text'; text: string }
  | { type: 'key'; key: SpecialKey }
  | { type: 'modifiers'; modifiers: ModifierState }
  | { type: 'switch'; to: 'coding' | 'system' };

export type Resolution = { keyboard: KeyboardState; effects: Effect[]; locked: boolean };

export type ResolveContext = {
  keyId: string;
  now: number;
  keyboard: KeyboardState;
  modifiers: ModifierState;
  held: HeldModifiers;
};

export function resolveAction(action: KeyAction, context: ResolveContext): Resolution {
  const { keyboard, modifiers, held, keyId, now } = context;
  const shiftOn = keyboard.shift !== 'off' || held.shift;
  // One-shot Shift lasts for one character (or one shifted key, like Shift+Tab).
  const afterShift: KeyboardState =
    keyboard.shift === 'once' ? { ...keyboard, shift: 'off' } : keyboard;

  switch (action.type) {
    case 'text': {
      let text = shiftOn && action.shifted ? action.shifted : action.text;
      // A held Ctrl or Alt that isn't already armed in the session applies here.
      const chord = {
        ctrl: held.ctrl && modifiers.ctrl === 'off',
        alt: held.alt && modifiers.alt === 'off',
      };
      if (chord.ctrl || chord.alt) text = applyModifiers(text, chord);
      return { keyboard: afterShift, effects: [{ type: 'text', text }], locked: false };
    }
    case 'key': {
      if (shiftOn && action.shifted) {
        return {
          keyboard: afterShift,
          effects: [{ type: 'key', key: action.shifted }],
          locked: false,
        };
      }
      return { keyboard, effects: [{ type: 'key', key: action.key }], locked: false };
    }
    case 'modifier': {
      const quick = keyboard.lastTap?.keyId === keyId && now - keyboard.lastTap.at < DOUBLE_TAP_MS;
      const lastTap = { keyId, at: now };
      if (action.modifier === 'shift') {
        const shift = nextModifierMode(keyboard.shift, { quick });
        return {
          keyboard: { ...keyboard, shift, lastTap },
          effects: [],
          locked: shift === 'locked',
        };
      }
      const next = tapModifier(modifiers, action.modifier, { quick });
      return {
        keyboard: { ...keyboard, lastTap },
        effects: [{ type: 'modifiers', modifiers: next }],
        locked: next[action.modifier] === 'locked',
      };
    }
    case 'lock': {
      if (action.modifier === 'shift') {
        return {
          keyboard: { ...keyboard, shift: 'locked', lastTap: null },
          effects: [],
          locked: true,
        };
      }
      return {
        keyboard: { ...keyboard, lastTap: null },
        effects: [{ type: 'modifiers', modifiers: lockModifier(modifiers, action.modifier) }],
        locked: true,
      };
    }
    case 'layer':
      return { keyboard: { ...keyboard, layer: action.layer }, effects: [], locked: false };
    case 'switch':
      return { keyboard, effects: [{ type: 'switch', to: action.to }], locked: false };
  }
}
