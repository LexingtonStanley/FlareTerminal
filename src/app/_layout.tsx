import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type ErrorBoundaryProps,
  type Theme,
} from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { FontFiles } from '@/constants/theme';
import { ConnectionsProvider } from '@/features/connections/connections-provider';
import { GroupsProvider } from '@/features/groups/groups-provider';
import { OutboxProvider } from '@/features/outbox/outbox-provider';
import { AttentionBanner } from '@/features/sessions/attention-banner';
import { PromptsProvider } from '@/features/prompts/prompts-provider';
import { SessionsProvider } from '@/features/sessions/sessions-provider';
import { PreferencesProvider } from '@/features/settings/preferences-provider';
import { ShortcutsProvider } from '@/features/shortcuts/shortcuts-provider';
import { KeysProvider } from '@/features/ssh/keys-provider';
import { AccessGuard } from '@/features/vault/access-guard';
import { LockProvider } from '@/features/vault/lock-provider';
import { useAppTheme, useType, type Type } from '@/hooks/use-theme';

// The splash stays up until the app's fonts are ready, so nothing draws in a fallback font.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/** React Navigation's headers, tab bar and screen backgrounds in the theme's colours and type. */
function navigationTheme({ mode, colors }: ReturnType<typeof useAppTheme>, { sans }: Type): Theme {
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  const font = (weight: 400 | 500 | 600 | 700) => ({
    fontFamily: sans(weight).fontFamily as string,
    fontWeight: 'normal' as const,
  });
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.attention,
    },
    fonts: { regular: font(400), medium: font(500), bold: font(600), heavy: font(700) },
  };
}

// No accounts: the hosts a person connects to do the authentication.
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FontFiles);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    // Keyboard avoidance that works with Android's edge-to-edge layout, where the window no
    // longer shrinks for the keyboard (see Screen and the session screen).
    <KeyboardProvider>
      <PreferencesProvider>
        <ThemedApp />
      </PreferencesProvider>
    </KeyboardProvider>
  );
}

/** The app inside the chosen theme, which can change while it runs. */
function ThemedApp() {
  const theme = useAppTheme();
  const type = useType();
  const { colors } = theme;

  return (
    <ThemeProvider value={navigationTheme(theme, type)}>
      <ConnectionsProvider>
        <GroupsProvider>
          <ShortcutsProvider>
            <PromptsProvider>
              <SessionsProvider>
                <OutboxProvider>
                  <LockProvider>
                    <KeysProvider>
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          headerShadowVisible: false,
                          headerTintColor: colors.text,
                          headerStyle: { backgroundColor: colors.background },
                          headerTitleStyle: { ...type.sans(600), fontSize: 17 },
                          contentStyle: { backgroundColor: colors.background },
                        }}>
                        {/* The title is what the back button on pushed screens says. */}
                        <Stack.Screen name="(tabs)" options={{ title: 'Home' }} />
                        <Stack.Screen
                          name="connections/new"
                          options={{ headerShown: true, title: 'New connection' }}
                        />
                        <Stack.Screen
                          name="connections/[id]"
                          options={{ headerShown: true, title: 'Edit connection' }}
                        />
                        <Stack.Screen
                          name="shortcuts/new"
                          options={{ headerShown: true, title: 'New shortcut' }}
                        />
                        <Stack.Screen
                          name="shortcuts/[id]"
                          options={{ headerShown: true, title: 'Edit shortcut' }}
                        />
                        <Stack.Screen
                          name="groups/new"
                          options={{ headerShown: true, title: 'New group' }}
                        />
                        <Stack.Screen
                          name="groups/[id]"
                          options={{ headerShown: true, title: 'Edit group' }}
                        />
                        <Stack.Screen
                          name="security"
                          options={{ headerShown: true, title: 'App lock' }}
                        />
                        <Stack.Screen
                          name="keys/new"
                          options={{ headerShown: true, title: 'Import key' }}
                        />
                        <Stack.Screen
                          name="keys/[id]"
                          options={{ headerShown: true, title: 'Key' }}
                        />
                        <Stack.Screen
                          name="session/[id]"
                          options={{ headerShown: true, title: '' }}
                        />
                        <Stack.Screen
                          name="session/[id]/preview"
                          options={{ headerShown: true, title: 'Preview' }}
                        />
                        <Stack.Screen
                          name="session/[id]/reading"
                          options={{ headerShown: true, title: 'Reading mode' }}
                        />
                        <Stack.Screen
                          name="outbox/[id]"
                          options={{ headerShown: true, title: 'File' }}
                        />
                      </Stack>
                      <AttentionBanner />
                      <AccessGuard />
                    </KeysProvider>
                  </LockProvider>
                </OutboxProvider>
              </SessionsProvider>
            </PromptsProvider>
          </ShortcutsProvider>
        </GroupsProvider>
      </ConnectionsProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen centered>
      <ThemedText type="code" themeColor="danger">
        exit 1
      </ThemedText>
      <ThemedText type="subtitle" role="heading">
        Something went wrong
      </ThemedText>
      {__DEV__ ? <ThemedText themeColor="textSecondary">{error.message}</ThemedText> : null}
      <Button title="Try again" onPress={retry} />
    </Screen>
  );
}
