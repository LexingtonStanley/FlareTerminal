import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  /** Shows a spinner and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;
  const textColor = isPrimary ? theme.onPrimary : theme.text;

  return (
    <Pressable
      role="button"
      // Keeps the accessible name while the spinner replaces the label.
      aria-label={title}
      aria-disabled={isDisabled}
      aria-busy={loading}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: isPrimary ? theme.primary : theme.backgroundElement },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 16, fontWeight: 600 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
