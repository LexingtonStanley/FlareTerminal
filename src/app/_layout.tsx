import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type ErrorBoundaryProps,
} from 'expo-router';
import { useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { ConnectionsProvider } from '@/features/connections/connections-provider';
import { PreferencesProvider } from '@/features/settings/preferences-provider';

// No accounts: the hosts a person connects to do the authentication.
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PreferencesProvider>
        <ConnectionsProvider>
          <Stack screenOptions={{ headerShown: false }}>
            {/* The title is what the back button on pushed screens says. */}
            <Stack.Screen name="(tabs)" options={{ title: 'Connections' }} />
            <Stack.Screen
              name="connections/new"
              options={{ headerShown: true, title: 'New connection' }}
            />
            <Stack.Screen
              name="connections/[id]"
              options={{ headerShown: true, title: 'Edit connection' }}
            />
            <Stack.Screen name="terminal/[id]" options={{ headerShown: true, title: '' }} />
          </Stack>
        </ConnectionsProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen centered>
      <ThemedText type="subtitle">Something went wrong</ThemedText>
      {__DEV__ ? <ThemedText themeColor="textSecondary">{error.message}</ThemedText> : null}
      <Button title="Try again" onPress={retry} />
    </Screen>
  );
}
