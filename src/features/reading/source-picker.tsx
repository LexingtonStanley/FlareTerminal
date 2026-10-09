import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

import { sameSource, type HistorySource } from './capture';

/** What a source is called: "tmux · main". */
export function sourceName(source: HistorySource | null): string {
  return source ? `${source.kind} · ${source.session}` : 'This screen';
}

/**
 * Where reading mode reads from: this screen, or one of the host's tmux and zellij sessions.
 * Chips like Home's group tabs.
 */
export function SourcePicker({
  sources,
  selected,
  onSelect,
}: {
  sources: HistorySource[];
  selected: HistorySource | null;
  onSelect(source: HistorySource | null): void;
}) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();
  const options: (HistorySource | null)[] = [null, ...sources];
  if (selected && !sources.some((source) => sameSource(source, selected))) options.push(selected);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      role="radiogroup"
      aria-label="Read from"
      keyboardShouldPersistTaps="handled"
      style={styles.bar}
      contentContainerStyle={styles.chips}>
      {options.map((source) => {
        const current = sameSource(source, selected);
        const icon: IconName = source ? 'server' : 'terminal';
        return (
          <Pressable
            key={sourceName(source)}
            role="radio"
            aria-checked={current}
            aria-label={sourceName(source)}
            onPress={() => onSelect(source)}
            style={({ pressed }) => [
              styles.chip,
              {
                borderRadius: shape.radius.pill,
                borderWidth: shape.hairline,
                backgroundColor: current
                  ? theme.primaryMuted
                  : pressed
                    ? theme.backgroundSelected
                    : theme.backgroundElement,
                borderColor: current ? theme.primary : theme.border,
              },
            ]}>
            <Icon name={icon} size={13} color={current ? 'primaryText' : 'textSecondary'} />
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                sans(600),
                { color: current ? theme.primaryText : theme.text },
              ]}>
              {sourceName(source)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0 },
  chips: { alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 36,
    maxWidth: 220,
    paddingHorizontal: Spacing.three,
  },
  label: { fontSize: 14, flexShrink: 1 },
});
