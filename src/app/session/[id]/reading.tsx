import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { historySourceOfCommand, type HistorySource } from '@/features/reading/capture';
import { lineText } from '@/features/reading/history';
import { HistoryList } from '@/features/reading/history-list';
import { SourcePicker, sourceName } from '@/features/reading/source-picker';
import { toBlocks, toMarkdown } from '@/features/reading/transcript';
import { useHistory, type History } from '@/features/reading/use-history';
import { newFrom } from '@/features/sessions/away';
import { SessionGate } from '@/features/sessions/session-gate';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { useSessionManager } from '@/features/sessions/sessions-provider';
import { useTerminalTheme } from '@/features/settings/use-terminal-theme';
import { useShape, useTheme } from '@/hooks/use-theme';

/**
 * Reading mode: a session's history as text to read, select and copy, with tool output
 * folded away. From tmux or zellij's own history when the agent runs in one (over SSH),
 * otherwise from what the app kept of the screen. Opened with `from=away`, it starts with
 * what arrived since the person left.
 */
export default function ReadingScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();

  return (
    <SessionGate id={id}>
      {(session) => <Reading session={session} sinceAway={from === 'away'} />}
    </SessionGate>
  );
}

/** How long Copy shows that it copied. */
const COPIED_MS = 2000;

function Reading({ session, sinceAway }: { session: SessionSnapshot; sinceAway: boolean }) {
  const manager = useSessionManager();
  const theme = useTheme();
  const shape = useShape();
  const terminal = useTerminalTheme();
  // Picked here, or else the session the shortcut's command opened.
  const source =
    session.history !== undefined ? session.history : historySourceOfCommand(session.command ?? '');
  const [attempt, setAttempt] = useState(0);
  const { history, last } = useHistory(session, source, attempt);
  // What the person saw when they left, kept here: the session forgets it once it's read.
  const [away] = useState(() => (sinceAway ? session.away : null));
  const [showAll, setShowAll] = useState(false);
  const start = useMemo(
    () => (away && history ? newFrom(history.lines.map(lineText), away.screen) : null),
    [away, history]
  );
  const recent = useMemo(
    () =>
      history && start !== null && start < history.lines.length && !showAll
        ? history.lines.slice(start)
        : null,
    [history, start, showAll]
  );
  const blocks = useMemo(
    () => (history ? toBlocks(recent ?? history.lines) : []),
    [history, recent]
  );

  useEffect(() => {
    if (away) manager.dismissAway(session.id);
  }, [away, manager, session.id]);
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
        <View style={styles.statusRow}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            aria-live="polite"
            style={styles.status}>
            {!history
              ? `Reading ${source ? sourceName(source) : 'this screen'}…`
              : recent
                ? describeRecent(recent.length, history, source)
                : `${away && !showAll ? awayNote(start, history) : ''}${describe(history, source)}`}
          </ThemedText>
          {recent ? (
            <Button
              title="Show all"
              size="small"
              variant="secondary"
              onPress={() => setShowAll(true)}
            />
          ) : null}
        </View>
      </View>
      {!history ? (
        <View style={[styles.fill, styles.centered, { backgroundColor: terminal.background }]}>
          <ActivityIndicator color={terminal.foreground} />
        </View>
      ) : blocks.length ? (
        <View style={styles.fill}>
          <HistoryList blocks={blocks} fromStart={recent !== null} />
        </View>
      ) : (
        <View style={[styles.fill, styles.centered, { backgroundColor: terminal.background }]}>
          <ThemedText themeColor="textSecondary">Nothing here yet.</ThemedText>
        </View>
      )}
    </Screen>
  );
}

const countLines = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'line' : 'lines'}`;

/** What's shown of the history when it starts where the person left off. */
function describeRecent(count: number, history: History, source: HistorySource | null): string {
  const from = history.from.kind === 'host' ? sourceName(source) : 'this screen';
  return `${countLines(count)} from ${from} since you left`;
}

/** Why the whole history shows when the person asked for what's new. */
function awayNote(start: number | null, history: History): string {
  return start !== null && start >= history.lines.length
    ? 'Nothing new since you left. '
    : 'Couldn’t find where you left off. ';
}

/** Where the history came from, and why it's only the screen when it is. */
function describe(history: History, source: HistorySource | null): string {
  const lines = countLines(history.lines.length);
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  status: { flex: 1 },
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
});
