import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ToggleRowProps = {
  title: string;
  /** A line under the title: what turning it on does. */
  caption?: string;
  value: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
};

/** A row with an on/off switch. The whole row is the switch, so it is a big target. */
export function ToggleRow({ title, caption, value, onChange, disabled = false }: ToggleRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      role="switch"
      aria-label={title}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.backgroundSelected },
        disabled && styles.disabled,
      ]}>
      <View style={styles.text}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {caption ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {caption}
          </ThemedText>
        ) : null}
      </View>
      <View pointerEvents="none" aria-hidden>
        <Switch
          value={value}
          disabled={disabled}
          trackColor={{ true: theme.primary, false: theme.backgroundSelected }}
          thumbColor={value ? theme.onPrimary : theme.backgroundElement}
          // react-native-web's prop for the thumb when on.
          {...{ activeThumbColor: theme.onPrimary }}
          ios_backgroundColor={theme.backgroundSelected}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.three,
  },
  text: { flex: 1, gap: Spacing.half },
  disabled: { opacity: 0.5 },
});
