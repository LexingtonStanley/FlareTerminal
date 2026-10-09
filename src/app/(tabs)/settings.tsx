import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Section } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Spacing } from '@/constants/theme';
import {
  FONT_SIZE,
  usePreferences,
  type Appearance,
} from '@/features/settings/preferences-provider';
import { TerminalPreview, ThemePicker } from '@/features/settings/theme-picker';
import { useTerminalTheme } from '@/features/settings/use-terminal-theme';
import { KeysCard } from '@/features/ssh/keys-card';
import { useLock } from '@/features/vault/lock-provider';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

const APPEARANCE_OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const { fontSize, setFontSize, appTheme, setAppTheme, appearance, setAppearance } =
    usePreferences();
  const terminalTheme = useTerminalTheme();
  const theme = useTheme();
  const shape = useShape();
  const { mono } = useType();
  const { version, extra } = Constants.expoConfig ?? {};
  const { settings: lock } = useLock();
  const router = useRouter();

  return (
    <Screen scroll style={styles.screen}>
      <ThemedText type="subtitle" role="heading" style={styles.title}>
        Settings
      </ThemedText>

      <Section title="Appearance">
        <Card>
          <TerminalPreview colors={terminalTheme} fontSize={fontSize} />
          <ThemePicker value={appTheme} onChange={setAppTheme} />
          <SegmentedControl
            label="Appearance"
            options={APPEARANCE_OPTIONS}
            value={appearance}
            onChange={setAppearance}
          />
          <ThemedText type="caption" themeColor="textSecondary">
            Each theme has a light and a dark version. A theme sets the app and the terminal
            together.
          </ThemedText>
        </Card>
      </Section>

      <Section title="Terminal">
        <Card flush>
          <View style={styles.row}>
            <View style={styles.grow}>
              <ThemedText type="smallBold">Font size</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                Points, for every session
              </ThemedText>
            </View>
            <View
              style={[
                styles.stepper,
                {
                  borderColor: theme.border,
                  borderRadius: shape.radius.pill,
                  borderWidth: shape.hairline,
                },
              ]}>
              <IconButton
                icon="minus"
                label="Smaller"
                color="text"
                onPress={() => setFontSize(fontSize - 1)}
                disabled={fontSize <= FONT_SIZE.min}
              />
              <ThemedText aria-label="Font size" style={[styles.value, mono(500)]}>
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
        </Card>
      </Section>

      <Section title="Security">
        <Card flush>
          <Pressable
            role="button"
            aria-label="App lock"
            onPress={() => router.push('/security')}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <Icon name="lock" size={18} color={lock ? 'primaryText' : 'textSecondary'} />
            <View style={styles.grow}>
              <ThemedText type="smallBold">App lock</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {lock
                  ? `${lock.kind === 'pin' ? 'PIN' : 'Password'}${lock.biometrics ? ' and biometrics' : ''} · vault encrypted`
                  : 'Off · protect the app, passwords and keys'}
              </ThemedText>
            </View>
            <Icon name="chevron" size={16} />
          </Pressable>
        </Card>
      </Section>

      <Section title="SSH keys">
        <KeysCard />
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
    padding: Spacing.half,
  },
  value: { minWidth: 32, textAlign: 'center', fontSize: 16 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
