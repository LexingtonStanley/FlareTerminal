import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { connectionLabel } from '@/features/connections/connections';
import { useConnections } from '@/features/connections/connections-provider';
import type { SessionTarget } from '@/features/sessions/session-manager';
import { STATUS_LABELS, StatusDot } from '@/features/sessions/session-status';
import {
  useSessionManager,
  useSessions,
  useStartSession,
} from '@/features/sessions/sessions-provider';
import { startupCommand } from '@/features/shortcuts/shortcuts';
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

  return (
    <Screen scroll>
      <ThemedText type="subtitle" role="heading">
        Home
      </ThemedText>

      {sessions.length ? (
        <View style={styles.section}>
          <ThemedText type="smallBold" role="heading" themeColor="textSecondary">
            Sessions
          </ThemedText>
          {sessions.map((session) => (
            <ThemedView key={session.id} type="backgroundElement" style={styles.row}>
              <Pressable
                role="button"
                aria-label={`Resume ${session.name}`}
                onPress={() => openSession(session.id)}
                style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
                <View style={styles.rowTitle}>
                  <StatusDot status={session.status} />
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
                    {session.name}
                  </ThemedText>
                </View>
                <ThemedText
                  type="small"
                  themeColor={session.attention ? 'primary' : 'textSecondary'}
                  numberOfLines={1}>
                  {session.attention?.body ?? session.title ?? STATUS_LABELS[session.status.state]}
                </ThemedText>
              </Pressable>
              <Pressable
                role="button"
                aria-label={`Close ${session.name}`}
                onPress={() => manager.close(session.id)}
                style={({ pressed }) => [styles.rowAction, pressed && styles.pressed]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ✕
                </ThemedText>
              </Pressable>
            </ThemedView>
          ))}
        </View>
      ) : null}

      {connections.length ? (
        <View style={styles.section}>
          <ThemedText type="smallBold" role="heading" themeColor="textSecondary">
            Shortcuts
          </ThemedText>
          <View style={styles.grid}>
            {shortcuts.map((shortcut) => {
              const connection = connections.find(({ id }) => id === shortcut.connectionId);
              return (
                <ThemedView key={shortcut.id} type="backgroundElement" style={styles.tile}>
                  <Pressable
                    role="button"
                    aria-label={`Run ${shortcut.name}`}
                    onPress={() =>
                      start({
                        connectionId: shortcut.connectionId,
                        name: shortcut.name,
                        command: startupCommand(shortcut),
                      })
                    }
                    style={({ pressed }) => [styles.tileMain, pressed && styles.pressed]}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {shortcut.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {connection?.name ?? 'Missing connection'}
                    </ThemedText>
                    <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                      {shortcut.command}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    role="button"
                    aria-label={`Edit shortcut ${shortcut.name}`}
                    onPress={() =>
                      router.push({ pathname: '/shortcuts/[id]', params: { id: shortcut.id } })
                    }
                    style={styles.tileEdit}>
                    <ThemedText type="small" themeColor="primary">
                      Edit
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              );
            })}
            <Pressable
              role="button"
              aria-label="New shortcut"
              onPress={() => router.push('/shortcuts/new')}
              style={({ pressed }) => [
                styles.tile,
                styles.addTile,
                { borderColor: theme.border },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" themeColor="primary">
                + Shortcut
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {shortcuts.length ? 'One tap to a command' : 'e.g. Claude in tmux, one tap'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <ThemedText type="smallBold" role="heading" themeColor="textSecondary">
          Connections
        </ThemedText>
        {connections.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Connect to your computer over SSH</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Nothing to install on it: if you can run this from a laptop, Flare can connect too.
            </ThemedText>
            <ThemedText
              type="code"
              selectable
              style={[styles.command, { borderColor: theme.border }]}>
              ssh lexde@lexbox
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              With Tailscale on the phone and the computer, use the computer&apos;s Tailscale name.
              Run agents inside tmux or zellij so they keep going while the phone is away.
            </ThemedText>
          </ThemedView>
        ) : (
          connections.map((connection) => (
            <ThemedView key={connection.id} type="backgroundElement" style={styles.row}>
              <Pressable
                role="button"
                aria-label={`Open ${connection.name}`}
                onPress={() =>
                  start({ connectionId: connection.id, name: connection.name, command: null })
                }
                style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
                <ThemedText type="smallBold">{connection.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {connection.kind === 'ttyd'
                    ? `ttyd · ${connectionLabel(connection)}`
                    : connectionLabel(connection)}
                </ThemedText>
              </Pressable>
              <Pressable
                role="button"
                aria-label={`Edit ${connection.name}`}
                onPress={() =>
                  router.push({ pathname: '/connections/[id]', params: { id: connection.id } })
                }
                style={({ pressed }) => [styles.rowAction, pressed && styles.pressed]}>
                <ThemedText type="small" themeColor="primary">
                  Edit
                </ThemedText>
              </Pressable>
            </ThemedView>
          ))
        )}
        <Button title="New connection" onPress={() => router.push('/connections/new')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  card: { gap: Spacing.two, padding: Spacing.three, borderRadius: Spacing.three },
  command: { padding: Spacing.two, borderWidth: 1, borderRadius: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: Spacing.three },
  rowMain: { flex: 1, gap: Spacing.half, padding: Spacing.three },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowAction: { padding: Spacing.three },
  shrink: { flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: Spacing.three, minHeight: 96 },
  tileMain: { flex: 1, gap: Spacing.half, padding: Spacing.three },
  tileEdit: { alignSelf: 'flex-end', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    padding: Spacing.three,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
