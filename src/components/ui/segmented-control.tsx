import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, sans, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  const dark = useColorScheme() === 'dark';

  return (
    <View
      role="radiogroup"
      aria-label={label}
      // The thumb sits one step above the track: white on grey by day, lighter ink at night.
      style={[
        styles.group,
        {
          backgroundColor: dark ? theme.backgroundElement : theme.backgroundSelected,
          borderColor: theme.border,
        },
      ]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              selected && {
                backgroundColor: dark ? theme.backgroundRaised : theme.backgroundElement,
                boxShadow: `0 1px 2px ${theme.shadow}${dark ? '80' : '1F'}`,
              },
            ]}>
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
  group: {
    flexDirection: 'row',
    padding: 3,
    gap: Spacing.half,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  option: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small + 1,
  },
  text: { ...sans(600), fontSize: 15 },
});
