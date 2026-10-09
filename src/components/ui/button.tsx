import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, sans, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';

type ButtonProps = {
  title: string;
  /** The accessible name, when the title alone is ambiguous (one "Approve" per row). */
  label?: string;
  onPress: () => void;
  /**
   * - primary: the screen's main action, in the accent. One per screen.
   * - secondary: other actions, on a card surface.
   * - danger: destructive actions (deleting), quiet until pressed.
   * - ghost: low-emphasis actions beside others, no surface.
   */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** A leading icon. */
  icon?: IconName;
  /** Compact height, for buttons inside cards and rows. */
  size?: 'regular' | 'small';
  /** Shows a spinner and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
};

const VARIANTS: Record<
  NonNullable<ButtonProps['variant']>,
  { background: ThemeColor | null; pressed: ThemeColor; text: ThemeColor; border: boolean }
> = {
  primary: { background: 'primary', pressed: 'primary', text: 'onPrimary', border: false },
  secondary: {
    background: 'backgroundElement',
    pressed: 'backgroundSelected',
    text: 'text',
    border: true,
  },
  danger: { background: null, pressed: 'backgroundSelected', text: 'danger', border: true },
  ghost: { background: null, pressed: 'backgroundSelected', text: 'primary', border: false },
};

export function Button({
  title,
  label,
  onPress,
  variant = 'primary',
  icon,
  size = 'regular',
  loading = false,
  disabled = false,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const look = VARIANTS[variant];
  const isDisabled = disabled || loading;
  const textColor = theme[look.text];

  return (
    <Pressable
      role="button"
      // Keeps the accessible name while the spinner replaces the label.
      aria-label={label ?? title}
      aria-disabled={isDisabled}
      aria-busy={loading}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        size === 'small' && styles.small,
        {
          backgroundColor: pressed
            ? theme[look.pressed]
            : look.background
              ? theme[look.background]
              : 'transparent',
          borderColor: look.border ? theme.border : 'transparent',
        },
        pressed && styles.pressed,
        pressed && variant === 'primary' && styles.pressedPrimary,
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={size === 'small' ? 16 : 18} color={look.text} /> : null}
          <Text
            numberOfLines={1}
            style={[styles.label, size === 'small' && styles.labelSmall, { color: textColor }]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minHeight: 38, paddingHorizontal: Spacing.three, borderRadius: Radius.small + 2 },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { ...sans(600), fontSize: 16, letterSpacing: -0.1 },
  labelSmall: { fontSize: 14 },
  pressed: { transform: [{ scale: 0.985 }] },
  pressedPrimary: { opacity: 0.86 },
  disabled: { opacity: 0.45 },
});
