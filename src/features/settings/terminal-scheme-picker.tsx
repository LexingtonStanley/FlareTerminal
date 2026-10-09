import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { TERMINAL_SCHEMES, type TerminalSchemeId } from '@/constants/terminal-schemes';
import { mono, Radius, sans, Spacing, type TerminalTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const SWATCHES = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const;

/**
 * A few lines of a pretend session in a terminal theme, at a font size: what the terminal
 * will look like. Colours come from the scheme, as they would from a host.
 */
export function TerminalPreview({ colors, fontSize }: { colors: TerminalTheme; fontSize: number }) {
  const text = { ...mono(400), fontSize, lineHeight: Math.round(fontSize * 1.45) };
  return (
    <View
      aria-label="Terminal preview"
      style={[styles.preview, { backgroundColor: colors.background }]}>
      <Text numberOfLines={1} style={[text, { color: colors.foreground }]}>
        <Text style={{ color: colors.green }}>➜ </Text>
        <Text style={{ color: colors.cyan }}>~/code/flare</Text>
        {' on '}
        <Text style={{ color: colors.magenta }}>main</Text>
        <Text style={{ color: colors.yellow }}> [!]</Text>
      </Text>
      <Text numberOfLines={1} style={[text, { color: colors.foreground }]}>
        $ claude --continue
        <Text style={{ color: colors.cursor, backgroundColor: colors.cursor }}> </Text>
      </Text>
      <Text numberOfLines={1} style={[text, { color: colors.brightBlack }]}>
        <Text style={{ color: colors.red }}>✗</Text> 1 failing ·{' '}
        <Text style={{ color: colors.green }}>✓</Text> 41 passing
      </Text>
    </View>
  );
}

type PickerProps = {
  value: TerminalSchemeId;
  onChange(id: TerminalSchemeId): void;
};

/** Terminal colour schemes as a radio group of swatch cards, in the current appearance. */
export function TerminalSchemePicker({ value, onChange }: PickerProps) {
  const theme = useTheme();
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <View role="radiogroup" aria-label="Terminal colours" style={styles.grid}>
      {TERMINAL_SCHEMES.map((scheme) => {
        const colors = scheme[mode];
        const selected = scheme.id === value;
        return (
          <Pressable
            key={scheme.id}
            role="radio"
            aria-checked={selected}
            aria-label={scheme.name}
            onPress={() => onChange(scheme.id)}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: selected ? theme.primary : theme.border,
                backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
              },
            ]}>
            <View style={[styles.swatch, { backgroundColor: colors.background }]}>
              <View style={styles.swatchLine}>
                <View style={[styles.bar, styles.barShort, { backgroundColor: colors.green }]} />
                <View style={[styles.bar, { backgroundColor: colors.foreground }]} />
                <View style={[styles.caret, { backgroundColor: colors.cursor }]} />
              </View>
              <View style={styles.chips}>
                {SWATCHES.map((name) => (
                  <View key={name} style={[styles.chip, { backgroundColor: colors[name] }]} />
                ))}
              </View>
              {selected ? (
                <View style={[styles.check, { backgroundColor: theme.primary }]}>
                  <Icon name="check" size={12} color="onPrimary" weight="bold" />
                </View>
              ) : null}
            </View>
            <ThemedText
              type="caption"
              themeColor={selected ? 'text' : 'textSecondary'}
              numberOfLines={1}
              style={styles.label}>
              {scheme.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
    overflow: 'hidden',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: {
    flexBasis: '30%',
    flexGrow: 1,
    padding: Spacing.one + 2,
    gap: Spacing.one + 2,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
  },
  swatch: { height: 44, borderRadius: Radius.small - 2, padding: Spacing.two - 1, gap: 7 },
  swatchLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bar: { height: 4, width: 28, borderRadius: 2 },
  barShort: { width: 8 },
  caret: { width: 4, height: 9, borderRadius: 1 },
  chips: { flexDirection: 'row', gap: 3 },
  chip: { flex: 1, height: 8, borderRadius: 2 },
  check: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...sans(600), paddingHorizontal: Spacing.half, paddingBottom: Spacing.half },
});
