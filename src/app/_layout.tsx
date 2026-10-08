import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type ErrorBoundaryProps,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) SplashScreen.hide();
  }, [isLoading]);

  // The splash screen stays up until the stored session has been read.
  if (isLoading) return null;

  // Signed-out users can only reach sign-in; signed-in users can't go back to it.
  // Protected routes are a client-side guard: enforce access with row level security.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
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
