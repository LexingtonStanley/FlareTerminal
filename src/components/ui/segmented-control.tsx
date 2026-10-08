import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SegmentedControlProps<T extends string> = {
  /** The group's accessible name. */
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
};

/** A row of mutually exclusive choices (a radio group). */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      role="radiogroup"
      aria-label={label}
      style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && { backgroundColor: theme.background }]}>
            <Text style={[styles.text, { color: selected ? theme.text : theme.textSecondary }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', padding: Spacing.half, borderRadius: Spacing.two },
  option: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two - 2,
  },
  text: { fontSize: 15, fontWeight: 600 },
});
