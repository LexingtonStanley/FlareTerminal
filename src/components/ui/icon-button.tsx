import { Pressable, StyleSheet } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { useShape, useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';

type IconButtonProps = {
  icon: IconName;
  /** The accessible name: what pressing does ("Close session"). */
  label: string;
  onPress(): void;
  color?: ThemeColor;
  /** A filled circle instead of a bare icon. */
  filled?: boolean;
  size?: number;
  disabled?: boolean;
};

/** A round button with just an icon. Its touch target is at least 40 points. */
export function IconButton({
  icon,
  label,
  onPress,
  color = 'textSecondary',
  filled = false,
  size = 18,
  disabled = false,
}: IconButtonProps) {
  const theme = useTheme();
  const shape = useShape();

  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: shape.radius.pill,
          borderWidth: shape.hairline,
          backgroundColor: pressed
            ? theme.backgroundSelected
            : filled
              ? theme.backgroundElement
              : 'transparent',
          borderColor: filled ? theme.border : 'transparent',
        },
        disabled && styles.disabled,
      ]}>
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
