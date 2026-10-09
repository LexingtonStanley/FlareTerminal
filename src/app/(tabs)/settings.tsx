import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Divider, Section } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { mono, Spacing } from '@/constants/theme';
import { FONT_SIZE, usePreferences } from '@/features/settings/preferences-provider';
import { TerminalPreview, TerminalSchemePicker } from '@/features/settings/terminal-scheme-picker';
import { useTerminalTheme } from '@/features/settings/use-terminal-theme';
import { AppKeyCard } from '@/features/ssh/app-key-card';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const { fontSize, setFontSize, terminalScheme, setTerminalScheme } = usePreferences();
  const terminalTheme = useTerminalTheme();
  const theme = useTheme();
  const { version, extra } = Constants.expoConfig ?? {};

  return (
    <Screen scroll style={styles.screen}>
      <ThemedText type="subtitle" role="heading" style={styles.title}>
        Settings
      </ThemedText>

      <Section title="Terminal">
        <Card flush>
          <View style={styles.row}>
            <View style={styles.grow}>
              <ThemedText type="smallBold">Font size</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                Points, for every session
              </ThemedText>
            </View>
            <View style={[styles.stepper, { borderColor: theme.border }]}>
              <IconButton
                icon="minus"
                label="Smaller"
                color="text"
                onPress={() => setFontSize(fontSize - 1)}
                disabled={fontSize <= FONT_SIZE.min}
              />
              <ThemedText aria-label="Font size" style={styles.value}>
                {fontSize}
              </ThemedText>
              <IconButton
                icon="add"
                label="Larger"
                color="text"
                onPress={() => setFontSize(fontSize + 1)}
                disabled={fontSize >= FONT_SIZE.max}
              />
            </View>
          </View>
          <Divider inset={Spacing.three} />
          <View style={styles.block}>
            <ThemedText type="smallBold">Colours</ThemedText>
            <TerminalPreview colors={terminalTheme} fontSize={fontSize} />
            <TerminalSchemePicker value={terminalScheme} onChange={setTerminalScheme} />
            <ThemedText type="caption" themeColor="textSecondary">
              Each scheme has a light and a dark version that follows your phone&apos;s appearance.
            </ThemedText>
          </View>
        </Card>
      </Section>

      <Section title="SSH key">
        <AppKeyCard />
      </Section>

      <Section title="About">
        <Card>
          <View style={styles.aboutRow}>
            <ThemedText type="smallBold" style={styles.grow}>
              Flare Terminal
            </ThemedText>
            <ThemedText type="code" themeColor="textSecondary">
              {version} · {extra?.variant ?? 'production'}
            </ThemedText>
          </View>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.four + 4 },
  title: { paddingTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three - 4,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three - 4,
  },
  grow: { flex: 1, gap: Spacing.half },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.half,
  },
  value: { ...mono(500), minWidth: 32, textAlign: 'center', fontSize: 16 },
  block: { gap: Spacing.three - 4, padding: Spacing.three },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
