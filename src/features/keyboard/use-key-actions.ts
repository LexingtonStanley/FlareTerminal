import { useEffect, useRef, useState } from 'react';

import type { SpecialKey } from '@/features/terminal/keys';

import { playHaptic } from './haptics';
import { INITIAL_KEYBOARD, resolveAction, type KeyboardState } from './keyboard-state';
import type { KeyActionHandler } from './key-surface';
import type { ModifierState } from './modifiers';

/** What both keyboards need from the terminal session. */
export type KeyboardInputProps = {
  /** Sticky Ctrl and Alt, owned by the session (it releases one-shot ones after input). */
  modifiers: ModifierState;
  onModifiersChange(next: ModifierState): void;
  /** A special key, for the terminal view to encode for its cursor mode. */
  onKey(key: SpecialKey): void;
  /** Characters to type; the session applies Ctrl and Alt. */
  onText(text: string): void;
};

/** Wires resolved key actions to the props, keeping Shift and the layer as local state. */
export function useKeyActions(
  { modifiers, onModifiersChange, onKey, onText }: KeyboardInputProps,
  onSwitch: (to: 'coding' | 'system') => void
) {
  const [keyboard, setKeyboard] = useState<KeyboardState>(INITIAL_KEYBOARD);
  // One touch event can resolve several actions before React re-renders (a rollover
  // commit, then the new key), so each must see the state the previous one left.
  const keyboardRef = useRef(keyboard);
  const modifiersRef = useRef(modifiers);
  useEffect(() => {
    modifiersRef.current = modifiers;
  }, [modifiers]);

  const perform: KeyActionHandler = (action, { keyId, held }) => {
    const result = resolveAction(action, {
      keyId,
      held,
      now: Date.now(),
      keyboard: keyboardRef.current,
      modifiers: modifiersRef.current,
    });
    if (result.keyboard !== keyboardRef.current) {
      keyboardRef.current = result.keyboard;
      setKeyboard(result.keyboard);
    }
    if (result.locked) playHaptic('lock');
    for (const effect of result.effects) {
      switch (effect.type) {
        case 'text':
          onText(effect.text);
          break;
        case 'key':
          onKey(effect.key);
          break;
        case 'modifiers':
          modifiersRef.current = effect.modifiers;
          onModifiersChange(effect.modifiers);
          break;
        case 'switch':
          onSwitch(effect.to);
          break;
      }
    }
  };

  return { keyboard, perform };
}
