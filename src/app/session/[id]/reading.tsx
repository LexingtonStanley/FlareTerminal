import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { historySourceOfCommand, type HistorySource } from '@/features/reading/capture';
import { HistoryList } from '@/features/reading/history-list';
import { SourcePicker, sourceName } from '@/features/reading/source-picker';
import { toBlocks, toMarkdown } from '@/features/reading/transcript';
import { useHistory, type History } from '@/features/reading/use-history';
import { SessionGate } from '@/features/sessions/session-gate';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { useSessionManager } from '@/features/sessions/sessions-provider';
import { useTerminalTheme } from '@/features/settings/use-terminal-theme';
import { useShape, useTheme } from '@/hooks/use-theme';

/**
 * Reading mode: a session's history as text to read, select and copy, with tool output
 * folded away. From tmux or zellij's own history when the agent runs in one (over SSH),
 * otherwise from what the app kept of the screen.
 */
export default function ReadingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <SessionGate id={id}>{(session) => <Reading session={session} />}</SessionGate>;
}

/** How long Copy shows that it copied. */
const COPIED_MS = 2000;

function Reading({ session }: { session: SessionSnapshot }) {
  const manager = useSessionManager();
  const theme = useTheme();
  const shape = useShape();
  const terminal = useTerminalTheme();
  // Picked here, or else the session the shortcut's command opened.
  const source =
    session.history !== undefined ? session.history : historySourceOfCommand(session.command ?? '');
  const [attempt, setAttempt] = useState(0);
  const { history, last } = useHistory(session, source, attempt);
  const blocks = useMemo(() => (history ? toBlocks(history.lines) : []), [history]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyAll() {
    await Clipboard.setStringAsync(toMarkdown(blocks));
    setCopied(true);
  }

  const sessions = last?.sessions ?? [];

  return (
    <Screen edges={['left', 'right', 'bottom']} style={styles.screen}>
      <Stack.Screen
        options={{
          title: `Reading · ${session.name}`,
          headerRight: () => (
            <View style={styles.headerRight}>
              <IconButton
                icon={copied ? 'check' : 'copy'}
                label={copied ? 'Copied as Markdown' : 'Copy all as Markdown'}
                disabled={!blocks.length}
                onPress={copyAll}
              />
              <IconButton
                icon="reconnect"
                label="Read again"
                disabled={!history}
                onPress={() => setAttempt((count) => count + 1)}
              />
            </View>
          ),
        }}
      />
      <View style={[styles.top, { borderColor: theme.border, borderBottomWidth: shape.hairline }]}>
        {sessions.length || source ? (
          <SourcePicker
            sources={sessions}
            selected={source}
            onSelect={(picked) => manager.setHistory(session.id, picked)}
          />
        ) : null}
        <ThemedText
          type="small"
          themeColor="textSecondary"
          aria-live="polite"
          style={styles.status}>
          {history
            ? describe(history, source)
            : `Reading ${source ? sourceName(source) : 'this screen'}…`}
        </ThemedText>
      </View>
      {!history ? (
        <View style={[styles.fill, styles.centered, { backgroundColor: terminal.background }]}>
          <ActivityIndicator color={terminal.foreground} />
        </View>
      ) : blocks.length ? (
        <View style={styles.fill}>
          <HistoryList blocks={blocks} />
        </View>
      ) : (
        <View style={[styles.fill, styles.centered, { backgroundColor: terminal.background }]}>
          <ThemedText themeColor="textSecondary">Nothing here yet.</ThemedText>
        </View>
      )}
    </Screen>
  );
}

/** Where the history came from, and why it's only the screen when it is. */
function describe(history: History, source: HistorySource | null): string {
  const count = history.lines.length;
  const lines = `${count.toLocaleString()} ${count === 1 ? 'line' : 'lines'}`;
  const { from } = history;
  if (from.kind === 'host') return `${lines} from ${sourceName(source)}`;
  const screen = `so this is the screen (${lines}).`;
  switch (from.reason) {
    case 'no source':
      return history.sessions.length
        ? `${lines} from this screen. Pick a session to read all of its history.`
        : `${lines} from this screen and its scrollback`;
    case 'no commands':
      return `Reading ${source?.kind}’s own history needs an SSH connection, ${screen}`;
    case 'offline':
      return `Not connected, ${screen}`;
    case 'no answer':
      return `The host didn’t answer, ${screen}`;
    case 'not found':
      return `Couldn’t read ${sourceName(source)}, ${screen}`;
  }
}

const styles = StyleSheet.create({
  // Fixed to the window, so the list scrolls inside it (and opens at the newest).
  screen: { padding: 0, gap: 0, maxWidth: '100%', flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  top: { gap: Spacing.two, paddingTop: Spacing.two },
  status: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
});
