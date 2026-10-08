import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const result = await signOut();
    // On success the guard in _layout.tsx returns to sign-in and this screen unmounts.
    setSigningOut(false);
    setError(result.error);
  }

  const { version, extra } = Constants.expoConfig ?? {};

  return (
    <Screen scroll>
      <ThemedText type="subtitle" role="heading">
        Settings
      </ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Account</ThemedText>
        <ThemedText themeColor="textSecondary">{session?.user.email}</ThemedText>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">App</ThemedText>
        <ThemedText themeColor="textSecondary">
          Version {version} ({extra?.variant ?? 'production'})
        </ThemedText>
      </ThemedView>

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
      <Button title="Sign out" variant="secondary" onPress={handleSignOut} loading={signingOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.one, padding: Spacing.three, borderRadius: Spacing.three },
});
