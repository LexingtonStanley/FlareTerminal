import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Divider, Section } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { mono, Radius, Spacing } from '@/constants/theme';
import { connectionLabel } from '@/features/connections/connections';
import { useConnections } from '@/features/connections/connections-provider';
import type { SessionTarget } from '@/features/sessions/session-manager';
import { STATUS_LABELS, StatusDot } from '@/features/sessions/session-status';
import {
  useSessionManager,
  useSessions,
  useStartSession,
} from '@/features/sessions/sessions-provider';
import { NewShortcutTile, ShortcutTile } from '@/features/shortcuts/shortcut-tile';
import { groupShortcuts, startupCommand, type Shortcut } from '@/features/shortcuts/shortcuts';
import { useShortcuts } from '@/features/shortcuts/shortcuts-provider';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const { connections } = useConnections();
  const { shortcuts } = useShortcuts();
  const sessions = useSessions();
  const manager = useSessionManager();
  const startSession = useStartSession();
  const router = useRouter();
  const theme = useTheme();

  const openSession = (id: string) => router.push({ pathname: '/session/[id]', params: { id } });
  const start = (target: SessionTarget) => openSession(startSession(target));
  const waiting = sessions.filter((session) => session.attention).length;
  const { groups, ungrouped } = groupShortcuts(shortcuts);

  const tile = (shortcut: Shortcut) => (
    <ShortcutTile
      key={shortcut.id}
      shortcut={shortcut}
      connectionName={connections.find(({ id }) => id === shortcut.connectionId)?.name}
      onRun={() =>
        start({
          connectionId: shortcut.connectionId,
          name: shortcut.name,
          command: startupCommand(shortcut),
        })
      }
      onEdit={() => router.push({ pathname: '/shortcuts/[id]', params: { id: shortcut.id } })}
    />
  );

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.wordmark}>
          <ThemedText role="heading" aria-label="Flare" style={styles.brand}>
            flare
          </ThemedText>
          <View style={[styles.cursor, { backgroundColor: theme.primary }]} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {sessions.length === 0
            ? 'A terminal for your coding agents'
            : `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'} open` +
              (waiting ? ` · ${waiting} ${waiting === 1 ? 'needs' : 'need'} you` : '')}
        </ThemedText>
      </View>

      {sessions.length ? (
        <Section title="Sessions">
          <Card flush>
            {sessions.map((session, index) => (
              <View key={session.id}>
                {index > 0 ? <Divider inset={Spacing.three + 20} /> : null}
                <View style={styles.row}>
                  {session.attention ? (
                    <View style={[styles.flare, { backgroundColor: theme.attention }]} />
                  ) : null}
                  <Pressable
                    role="button"
                    aria-label={`Resume ${session.name}`}
                    onPress={() => openSession(session.id)}
                    style={({ pressed }) => [
                      styles.rowMain,
                      pressed && { backgroundColor: theme.backgroundSelected },
                    ]}>
                    <View style={styles.rowLead}>
                      <StatusDot status={session.status} />
                    </View>
                    <View style={styles.rowText}>
                      <ThemedText type="headline" numberOfLines={1}>
                        {session.name}
                      </ThemedText>
                      <View style={styles.inline}>
                        {session.attention ? (
                          <Icon name="bell" size={14} color="attention" />
                        ) : null}
                        <ThemedText
                          type="small"
                          themeColor={session.attention ? 'attention' : 'textSecondary'}
                          numberOfLines={1}
                          style={styles.shrink}>
                          {session.attention?.body ??
                            session.title ??
                            STATUS_LABELS[session.status.state]}
                        </ThemedText>
                      </View>
                    </View>
                  </Pressable>
                  <View style={styles.rowAction}>
                    <IconButton
                      icon="close"
                      label={`Close ${session.name}`}
                      onPress={() => manager.close(session.id)}
                    />
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {connections.length ? (
        <>
          {groups.map((group) => (
            <Section key={group.name} title={group.name}>
              <View style={styles.grid}>{group.shortcuts.map(tile)}</View>
            </Section>
          ))}
          <Section title="Shortcuts">
            <View style={styles.grid}>
              {ungrouped.map(tile)}
              <NewShortcutTile
                onPress={() => router.push('/shortcuts/new')}
                hint={
                  shortcuts.length ? 'An agent or any command' : 'e.g. Claude Code in tmux, one tap'
                }
              />
            </View>
          </Section>
        </>
      ) : null}

      <Section title="Connections">
        {connections.length === 0 ? (
          <Card style={styles.empty}>
            <View
              style={[
                styles.window,
                { backgroundColor: theme.background, borderColor: theme.border },
              ]}>
              <View style={styles.windowBar}>
                {[0, 1, 2].map((dot) => (
                  <View
                    key={dot}
                    style={[styles.windowDot, { backgroundColor: theme.backgroundSelected }]}
                  />
                ))}
              </View>
              <View style={styles.prompt}>
                <ThemedText type="code" themeColor="primary" style={styles.promptText}>
                  $
                </ThemedText>
                <ThemedText type="code" selectable style={styles.promptText}>
                  ssh lexde@lexbox
                </ThemedText>
                <View style={[styles.promptCursor, { backgroundColor: theme.primary }]} />
              </View>
            </View>
            <ThemedText type="headline">Connect to your computer over SSH</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Nothing to install on it: if you can run this from a laptop, Flare can connect too.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              With Tailscale on the phone and the computer, use the computer&apos;s Tailscale name.
              Run agents inside tmux or zellij so they keep going while the phone is away.
            </ThemedText>
          </Card>
        ) : (
          <Card flush>
            {connections.map((connection, index) => (
              <View key={connection.id}>
                {index > 0 ? <Divider inset={Spacing.three + 40 + Spacing.three - 4} /> : null}
                <View style={styles.row}>
                  <Pressable
                    role="button"
                    aria-label={`Open ${connection.name}`}
                    onPress={() =>
                      start({ connectionId: connection.id, name: connection.name, command: null })
                    }
                    style={({ pressed }) => [
                      styles.rowMain,
                      pressed && { backgroundColor: theme.backgroundSelected },
                    ]}>
                    <View style={[styles.monogram, { backgroundColor: theme.backgroundSelected }]}>
                      <ThemedText style={styles.monogramText}>
                        {(connection.name.trim()[0] ?? '?').toUpperCase()}
                      </ThemedText>
                    </View>
                    <View style={styles.rowText}>
                      <ThemedText type="headline" numberOfLines={1}>
                        {connection.name}
                      </ThemedText>
                      <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                        {connection.kind === 'ttyd'
                          ? `ttyd · ${connectionLabel(connection)}`
                          : connectionLabel(connection)}
                      </ThemedText>
                    </View>
                  </Pressable>
                  <View style={styles.rowAction}>
                    <IconButton
                      icon="edit"
                      size={16}
                      label={`Edit ${connection.name}`}
                      onPress={() =>
                        router.push({
                          pathname: '/connections/[id]',
                          params: { id: connection.id },
                        })
                      }
                    />
                  </View>
                </View>
              </View>
            ))}
          </Card>
        )}
        <Button
          title="New connection"
          icon="add"
          variant={connections.length ? 'secondary' : 'primary'}
          onPress={() => router.push('/connections/new')}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.four + 4 },
  header: { gap: Spacing.half, paddingTop: Spacing.two },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  brand: { ...mono(600), fontSize: 30, lineHeight: 38, letterSpacing: -1 },
  cursor: { width: 13, height: 27, borderRadius: 2, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  flare: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2 },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 4,
    paddingLeft: Spacing.three,
    minHeight: 64,
  },
  rowLead: { width: 16, alignItems: 'center' },
  rowText: { flex: 1, gap: Spacing.half },
  rowAction: { paddingHorizontal: Spacing.two },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  shrink: { flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two + 2 },
  monogram: {
    width: 40,
    height: 40,
    borderRadius: Radius.medium - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: { ...mono(600), fontSize: 17, lineHeight: 22 },
  empty: { gap: Spacing.three - 4, padding: Spacing.three },
  window: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.three,
    marginBottom: Spacing.one,
  },
  windowBar: { flexDirection: 'row', gap: 6, padding: Spacing.two + 2 },
  windowDot: { width: 9, height: 9, borderRadius: 4.5 },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  promptText: { fontSize: 15, lineHeight: 22 },
  promptCursor: { width: 9, height: 18, borderRadius: 1.5, marginLeft: -4 },
});
