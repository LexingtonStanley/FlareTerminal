import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

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
  const shape = useShape();
  const { sans } = useType();
  const dark = useColorScheme() === 'dark';

  return (
    <View
      role="radiogroup"
      aria-label={label}
      // The thumb sits one step above the track: white on grey by day, lighter ink at night.
      style={[
        styles.group,
        {
          backgroundColor: theme.segmentTrack,
          borderColor: theme.border,
          borderRadius: shape.radius.medium,
          borderWidth: shape.hairline,
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
              { borderRadius: Math.max(0, shape.radius.medium - 3) },
              selected && {
                backgroundColor: theme.segmentThumb,
                boxShadow: `0 1px 2px ${theme.shadow}${dark ? '80' : '1F'}`,
              },
            ]}>
            <Text
              style={[
                styles.text,
                sans(600),
                { color: selected ? theme.text : theme.textSecondary },
              ]}>
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
  },
  option: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 15 },
});
