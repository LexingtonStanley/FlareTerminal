import { useMemo } from 'react';

import { KeySurface } from './key-surface';
import { keyboardRows } from './layout';
import { useKeyActions, type KeyboardInputProps } from './use-key-actions';

export type CodingKeyboardProps = KeyboardInputProps & {
  /** The hide key: put the keyboard away to see the whole terminal. */
  onHide(): void;
  /** A flick up on the hide key: the phone's keyboard (dictation, swipe typing, prose). */
  onUseSystemKeyboard(): void;
};

/**
 * Mode B: a full keyboard that replaces the phone's while in the terminal. No
 * autocorrect or IME, so every key reaches the terminal as typed. The accessory bar's
 * row stays on top; below it, letters, symbols or navigation keys.
 */
export function CodingKeyboard({ onHide, onUseSystemKeyboard, ...input }: CodingKeyboardProps) {
  const { keyboard, perform } = useKeyActions(input, (to) => {
    if (to === 'system') onUseSystemKeyboard();
    if (to === 'hidden') onHide();
  });
  const rows = useMemo(() => keyboardRows(keyboard.layer), [keyboard.layer]);

  return (
    <KeySurface
      rows={rows}
      label="Coding keyboard"
      role="group"
      modes={{ ctrl: input.modifiers.ctrl, alt: input.modifiers.alt, shift: keyboard.shift }}
      onAction={perform}
    />
  );
}
