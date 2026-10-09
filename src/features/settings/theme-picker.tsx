import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { APP_THEMES, type AppThemeId } from '@/constants/app-themes';
import { Spacing, type TerminalTheme } from '@/constants/theme';
import { useAppTheme, useShape, useTheme, useType } from '@/hooks/use-theme';

const SWATCHES = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const;

const COLUMNS = 3;

/** The themes in rows of three; the last row is padded so its tiles keep their width. */
const ROWS = Array.from({ length: Math.ceil(APP_THEMES.length / COLUMNS) }, (_, row) =>
  Array.from({ length: COLUMNS }, (_, column) => APP_THEMES[row * COLUMNS + column] ?? null)
);

/**
 * A few lines of a pretend session in a terminal theme, at a font size: what the terminal
 * will look like. Colours come from the theme, as they would from a host.
 */
export function TerminalPreview({ colors, fontSize }: { colors: TerminalTheme; fontSize: number }) {
  const { radius } = useShape();
  const { mono } = useType();
  const text = { ...mono(400), fontSize, lineHeight: Math.round(fontSize * 1.45) };
  return (
    <View
      aria-label="Terminal preview"
      style={[styles.preview, { backgroundColor: colors.background, borderRadius: radius.medium }]}>
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
  value: AppThemeId;
  onChange(id: AppThemeId): void;
};

/**
 * The app's themes as a radio group of swatch cards. Each tile draws its own theme's terminal
 * in the current mode; the tiles themselves are in the current theme.
 */
export function ThemePicker({ value, onChange }: PickerProps) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();
  const { mode } = useAppTheme();

  return (
    <View role="radiogroup" aria-label="Theme" style={styles.grid}>
      {ROWS.map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map((option, column) => {
            if (!option) return <View key={column} style={styles.filler} />;
            const colors = option[mode].terminal;
            const selected = option.id === value;
            return (
              <Pressable
                key={option.id}
                role="radio"
                aria-checked={selected}
                aria-label={option.name}
                onPress={() => onChange(option.id)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: selected ? theme.primary : theme.border,
                    borderRadius: shape.radius.medium,
                    borderWidth: shape.borderWidthStrong,
                    backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                  },
                ]}>
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: colors.background,
                      borderRadius: Math.max(0, shape.radius.small - 2),
                    },
                  ]}>
                  <View style={styles.swatchLine}>
                    <View
                      style={[styles.bar, styles.barShort, { backgroundColor: colors.green }]}
                    />
                    <View style={[styles.bar, { backgroundColor: colors.foreground }]} />
                    <View style={[styles.caret, { backgroundColor: colors.cursor }]} />
                  </View>
                  <View style={styles.chips}>
                    {SWATCHES.map((name) => (
                      <View key={name} style={[styles.chip, { backgroundColor: colors[name] }]} />
                    ))}
                  </View>
                </View>
                <View style={styles.footer}>
                  <ThemedText
                    type="caption"
                    themeColor={selected ? 'text' : 'textSecondary'}
                    numberOfLines={1}
                    style={[styles.label, sans(600)]}>
                    {option.name}
                  </ThemedText>
                  {selected ? (
                    <View
                      style={[
                        styles.check,
                        { backgroundColor: theme.primary, borderRadius: shape.radius.pill },
                      ]}>
                      <Icon name="check" size={12} color="onPrimary" weight="bold" />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
    overflow: 'hidden',
  },
  grid: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  filler: { flex: 1 },
  option: {
    flex: 1,
    minWidth: 0,
    padding: Spacing.one + 2,
    gap: Spacing.one + 2,
  },
  swatch: { height: 44, padding: Spacing.two - 1, gap: 7 },
  swatchLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bar: { height: 4, width: 28, borderRadius: 2 },
  barShort: { width: 8 },
  caret: { width: 4, height: 9, borderRadius: 1 },
  chips: { flexDirection: 'row', gap: 3 },
  chip: { flex: 1, height: 8, borderRadius: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 18,
    paddingHorizontal: Spacing.half,
    paddingBottom: Spacing.half,
  },
  label: { flex: 1 },
  check: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
});
