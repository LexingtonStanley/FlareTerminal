import { KeySurface } from './key-surface';
import { BAR_ROWS } from './layout';
import { useKeyActions, type KeyboardInputProps } from './use-key-actions';

export type AccessoryBarProps = KeyboardInputProps & {
  /** The keyboard key: swap the phone's keyboard for the coding keyboard. */
  onOpenKeyboard(): void;
};

/**
 * Mode A: one row above the phone's own keyboard with what it lacks. Esc; Tab (flick up
 * for Shift+Tab); sticky Ctrl (flick up for Ctrl-C) and Alt; an arrows joystick; two
 * symbol keys with four more symbols each a flick away; and the coding keyboard.
 */
export function AccessoryBar({ onOpenKeyboard, ...input }: AccessoryBarProps) {
  const { keyboard, perform } = useKeyActions(input, (to) => {
    if (to === 'coding') onOpenKeyboard();
  });

  return (
    <KeySurface
      rows={BAR_ROWS}
      label="Terminal keys"
      role="toolbar"
      modes={{ ctrl: input.modifiers.ctrl, alt: input.modifiers.alt, shift: keyboard.shift }}
      onAction={perform}
      compact
    />
  );
}
