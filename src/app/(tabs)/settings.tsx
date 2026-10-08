import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { FONT_SIZE, usePreferences } from '@/features/settings/preferences-provider';
import { AppKeyCard } from '@/features/ssh/app-key-card';

export default function SettingsScreen() {
  const { fontSize, setFontSize } = usePreferences();
  const { version, extra } = Constants.expoConfig ?? {};

  return (
    <Screen scroll>
      <ThemedText type="subtitle" role="heading">
        Settings
      </ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Terminal font size</ThemedText>
        <View style={styles.stepper}>
          <View style={styles.step}>
            <Button
              title="Smaller"
              variant="secondary"
              onPress={() => setFontSize(fontSize - 1)}
              disabled={fontSize <= FONT_SIZE.min}
            />
          </View>
          <ThemedText aria-label="Font size" style={styles.value}>
            {fontSize}
          </ThemedText>
          <View style={styles.step}>
            <Button
              title="Larger"
              variant="secondary"
              onPress={() => setFontSize(fontSize + 1)}
              disabled={fontSize >= FONT_SIZE.max}
            />
          </View>
        </View>
      </ThemedView>

      <AppKeyCard />

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">App</ThemedText>
        <ThemedText themeColor="textSecondary">
          Version {version} ({extra?.variant ?? 'production'})
        </ThemedText>
      </ThemedView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, padding: Spacing.three, borderRadius: Spacing.three },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  step: { flex: 1 },
  value: { minWidth: 32, textAlign: 'center' },
});
