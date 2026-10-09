import { openBrowserAsync } from 'expo-web-browser';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing, TerminalColors } from '@/constants/theme';
import { StatusBadge } from '@/features/sessions/session-status';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { SessionStrip } from '@/features/sessions/session-strip';
import { useSessionManager, useSessions } from '@/features/sessions/sessions-provider';
import { useSessionView } from '@/features/sessions/use-session-view';
import { usePreferences } from '@/features/settings/preferences-provider';
import { Composer } from '@/features/terminal/composer';
import { KeyBar } from '@/features/terminal/key-bar';
import TerminalView, { type TerminalViewHandle } from '@/features/terminal/terminal-view';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSessions().find((candidate) => candidate.id === id);

  if (!session) {
    return (
      <Screen centered>
        <ThemedText type="subtitle" role="heading">
          Session not found
        </ThemedText>
        <ThemedText themeColor="textSecondary">It was closed, or the app restarted.</ThemedText>
        <Link href="/">
          <ThemedText type="linkPrimary">Back home</ThemedText>
        </Link>
      </Screen>
    );
  }

  return <TerminalSession session={session} />;
}

// Terminal output is untrusted: only ever open web links from it.
function openLink(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
  else void openBrowserAsync(url);
}

function TerminalSession({ session }: { session: SessionSnapshot }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { fontSize } = usePreferences();
  const headerHeight = useHeaderHeight();
  const manager = useSessionManager();
  const router = useRouter();
  const viewRef = useRef<TerminalViewHandle>(null);
  const view = useSessionView(viewRef, session.id);

  function closeSession() {
    manager.close(session.id);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <Screen edges={['left', 'right', 'bottom']} style={styles.screen}>
      <Stack.Screen
        options={{
          headerTitle: () => <SessionTitle name={session.name} title={session.title} />,
          headerRight: () => (
            <View style={styles.headerRight}>
              <StatusBadge status={session.status} />
              <Pressable
                role="button"
                aria-label="Close session"
                onPress={closeSession}
                style={styles.close}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          ),
        }}
      />
      <SessionStrip currentId={session.id} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}>
        <View style={[styles.flex, { backgroundColor: TerminalColors[scheme].background }]}>
          <TerminalView
            ref={viewRef}
            theme={TerminalColors[scheme]}
            fontSize={fontSize}
            {...view.viewCallbacks}
            onOpenLink={openLink}
            dom={{
              style: styles.flex,
              scrollEnabled: false,
              bounces: false,
              overScrollMode: 'never',
              hideKeyboardAccessoryView: true,
            }}
          />
          {session.status.state === 'closed' ? (
            <ThemedView type="backgroundElement" style={styles.banner}>
              <ThemedText type="small" role="alert">
                {session.status.message}
              </ThemedText>
              <Button title="Reconnect" onPress={() => manager.reconnect(session.id)} />
            </ThemedView>
          ) : null}
        </View>
        <KeyBar
          modifiers={view.modifiers}
          onToggleModifier={view.toggleModifier}
          onKey={view.pressKey}
          onText={view.type}
        />
        <Composer
          modifiers={view.modifiers}
          secure={session.inputMode === 'secret'}
          onSubmit={view.submit}
          onModifiedKey={view.type}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

// Room for the back button and the status badge; the header only budgets for icons.
const HEADER_SIDES_WIDTH = 240;

function SessionTitle({ name, title }: { name: string; title: string | null }) {
  const { width } = useWindowDimensions();

  return (
    <View style={{ maxWidth: width - HEADER_SIDES_WIDTH }}>
      <ThemedText type="smallBold" role="heading" numberOfLines={1}>
        {name}
      </ThemedText>
      {title ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {title}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { padding: 0, gap: 0, maxWidth: '100%' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  close: { padding: Spacing.two },
  banner: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
