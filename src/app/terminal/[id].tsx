import { openBrowserAsync } from 'expo-web-browser';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing, TerminalColors } from '@/constants/theme';
import type { Connection } from '@/features/connections/connections';
import { useConnections } from '@/features/connections/connections-provider';
import { usePreferences } from '@/features/settings/preferences-provider';
import { Composer } from '@/features/terminal/composer';
import { KeyBar } from '@/features/terminal/key-bar';
import { openTransport } from '@/features/terminal/open-transport';
import TerminalView, { type TerminalViewHandle } from '@/features/terminal/terminal-view';
import type { SessionStatus } from '@/features/terminal/transport';
import { useTerminalSession } from '@/features/terminal/use-terminal-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export default function TerminalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections, getPassword } = useConnections();
  const connection = connections.find((candidate) => candidate.id === id);

  if (!connection) {
    return (
      <Screen centered>
        <ThemedText type="subtitle" role="heading">
          Connection not found
        </ThemedText>
        <Link href="/">
          <ThemedText type="linkPrimary">Back to connections</ThemedText>
        </Link>
      </Screen>
    );
  }

  return <TerminalSessionScreen connection={connection} password={getPassword(connection.id)} />;
}

// Terminal output is untrusted: only ever open web links from it.
function openLink(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
  else void openBrowserAsync(url);
}

function TerminalSessionScreen({
  connection,
  password,
}: {
  connection: Connection;
  password: string | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { fontSize } = usePreferences();
  const headerHeight = useHeaderHeight();
  const viewRef = useRef<TerminalViewHandle>(null);
  const session = useTerminalSession(viewRef, (listener) =>
    openTransport(connection, password, listener)
  );

  return (
    <Screen edges={['left', 'right', 'bottom']} style={styles.screen}>
      <Stack.Screen
        options={{
          headerTitle: () => <SessionTitle name={connection.name} title={session.title} />,
          headerRight: () => <StatusBadge status={session.status} />,
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}>
        <View style={[styles.flex, { backgroundColor: TerminalColors[scheme].background }]}>
          <TerminalView
            ref={viewRef}
            theme={TerminalColors[scheme]}
            fontSize={fontSize}
            {...session.viewCallbacks}
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
              <Button title="Reconnect" onPress={session.reconnect} />
            </ThemedView>
          ) : null}
        </View>
        <KeyBar
          modifiers={session.modifiers}
          onToggleModifier={session.toggleModifier}
          onKey={session.pressKey}
          onText={session.type}
        />
        <Composer
          modifiers={session.modifiers}
          onSubmit={session.submit}
          onModifiedKey={session.type}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

// Room for the back button and the status badge; the header only budgets for icons.
const HEADER_SIDES_WIDTH = 210;

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

const STATUS_LABELS: Record<SessionStatus['state'], string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  closed: 'Disconnected',
};

function StatusBadge({ status }: { status: SessionStatus }) {
  const theme = useTheme();
  const color =
    status.state === 'connected'
      ? theme.success
      : status.state === 'closed'
        ? theme.danger
        : theme.textSecondary;

  return (
    <View style={styles.badge} aria-label={`Status: ${STATUS_LABELS[status.state]}`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {STATUS_LABELS[status.state]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { padding: 0, gap: 0, maxWidth: '100%' },
  banner: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
