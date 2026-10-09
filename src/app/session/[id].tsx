import { openBrowserAsync } from 'expo-web-browser';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keyboard, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import { StatusBadge } from '@/features/sessions/session-status';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { SessionStrip } from '@/features/sessions/session-strip';
import { useSessionManager, useSessions } from '@/features/sessions/sessions-provider';
import { useSessionView } from '@/features/sessions/use-session-view';
import { usePreferences } from '@/features/settings/preferences-provider';
import { AccessoryBar } from '@/features/keyboard/accessory-bar';
import { CodingKeyboard } from '@/features/keyboard/coding-keyboard';
import { toModifiers } from '@/features/keyboard/modifiers';
import { Composer } from '@/features/terminal/composer';
import TerminalView, { type TerminalViewHandle } from '@/features/terminal/terminal-view';
import { useTerminalTheme } from '@/features/settings/use-terminal-theme';
import { useLock } from '@/features/vault/lock-provider';
import { UnlockPanel } from '@/features/vault/unlock-panel';
import { useProtection } from '@/features/vault/use-protection';
import { shadows, useShape, useTheme } from '@/hooks/use-theme';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSessions().find((candidate) => candidate.id === id);
  const { settings, isAuthorized, authorize } = useLock();
  const scope = useProtection()(session?.connectionId ?? '');

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

  // A protected connection or group asks for the lock each time the person comes back.
  // The session keeps running meanwhile; it just isn't shown.
  if (scope && settings && !isAuthorized(scope)) {
    return (
      <Screen scroll centered edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: session.name }} />
        <UnlockPanel
          title={`Unlock ${session.name}`}
          message={
            scope.startsWith('group:')
              ? 'Its group is protected. It stays connected while locked.'
              : 'This connection is protected. It stays connected while locked.'
          }
          autoBiometrics
          onUnlocked={() => authorize(scope)}
        />
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
  const terminalTheme = useTerminalTheme();
  const { fontSize } = usePreferences();
  const headerHeight = useHeaderHeight();
  const manager = useSessionManager();
  const router = useRouter();
  const viewRef = useRef<TerminalViewHandle>(null);
  const view = useSessionView(viewRef, session.id);
  const theme = useTheme();
  const shape = useShape();
  const insets = useSafeAreaInsets();
  // The coding keyboard; none, to see the whole terminal (a tap brings it back); or
  // "writing": a text field with the phone's keyboard, for prose (autocorrect, swiping,
  // dictation) and the key bar for the keys it lacks.
  const [input, setInput] = useState<'keys' | 'hidden' | 'writing'>('keys');
  const writing = input === 'writing';
  const keys = {
    modifiers: view.modifiers,
    onModifiersChange: view.setModifiers,
    onKey: view.pressKey,
    onText: view.type,
  };

  function closeSession() {
    manager.close(session.id);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <Screen
      edges={input === 'keys' ? ['left', 'right'] : ['left', 'right', 'bottom']}
      style={styles.screen}>
      <Stack.Screen
        options={{
          headerTitle: () => <SessionTitle name={session.name} title={session.title} />,
          headerRight: () => (
            <View style={styles.headerRight}>
              <StatusBadge status={session.status} />
              <IconButton icon="close" label="Close session" onPress={closeSession} />
            </View>
          ),
        }}
      />
      <SessionStrip currentId={session.id} />
      <KeyboardAvoidingView
        style={styles.flex}
        // keyboard-controller's version, so Android's edge-to-edge layout avoids it too.
        behavior="padding"
        keyboardVerticalOffset={headerHeight}>
        <View style={[styles.flex, { backgroundColor: terminalTheme.background }]}>
          <TerminalView
            ref={viewRef}
            theme={terminalTheme}
            fontSize={fontSize}
            {...view.viewCallbacks}
            onOpenLink={openLink}
            onTap={() => setInput((current) => (current === 'hidden' ? 'keys' : current))}
            dom={{
              style: styles.flex,
              scrollEnabled: false,
              bounces: false,
              overScrollMode: 'never',
              hideKeyboardAccessoryView: true,
            }}
          />
          {session.status.state === 'closed' ? (
            <ThemedView
              type="backgroundRaised"
              style={[
                styles.banner,
                {
                  borderColor: theme.border,
                  borderRadius: shape.radius.large,
                  borderWidth: shape.hairline,
                  boxShadow: shadows(shape.shadowFloat),
                },
              ]}>
              <ThemedText type="small" role="alert">
                {session.reconnecting
                  ? `${session.status.message}. Reconnecting…`
                  : session.status.message}
              </ThemedText>
              <Button title="Reconnect" onPress={() => manager.reconnect(session.id)} />
            </ThemedView>
          ) : input === 'hidden' ? (
            <View style={styles.showKeyboard}>
              <IconButton
                icon="keyboard"
                label="Show keyboard"
                filled
                onPress={() => {
                  setInput('keys');
                  viewRef.current?.focus();
                }}
              />
            </View>
          ) : null}
        </View>
        {writing ? (
          <>
            <AccessoryBar
              {...keys}
              onOpenKeyboard={() => {
                Keyboard.dismiss();
                setInput('keys');
                viewRef.current?.focus();
              }}
            />
            <Composer
              modifiers={toModifiers(view.modifiers)}
              secure={session.inputMode === 'secret'}
              onSubmit={view.submit}
              onModifiedKey={view.type}
            />
          </>
        ) : input === 'keys' ? (
          // The tray colour runs under the home indicator.
          <View style={{ paddingBottom: insets.bottom, backgroundColor: theme.keyboard }}>
            <CodingKeyboard
              {...keys}
              onHide={() => setInput('hidden')}
              onUseSystemKeyboard={() => setInput('writing')}
            />
          </View>
        ) : null}
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
      <ThemedText type="headline" role="heading" numberOfLines={1}>
        {name}
      </ThemedText>
      {title ? (
        <ThemedText type="code" themeColor="textSecondary" numberOfLines={1} style={styles.title}>
          {title}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { padding: 0, gap: 0, maxWidth: '100%' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  title: { fontSize: 12, lineHeight: 16 },
  showKeyboard: { position: 'absolute', right: Spacing.three, bottom: Spacing.three },
  banner: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    gap: Spacing.three - 4,
    padding: Spacing.three,
  },
});
