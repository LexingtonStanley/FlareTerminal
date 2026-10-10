import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Divider, Section } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { connectionLabel } from '@/features/connections/connections';
import { useConnections } from '@/features/connections/connections-provider';
import { ALL_GROUPS, GroupTabs } from '@/features/groups/group-tabs';
import { useGroups } from '@/features/groups/groups-provider';
import { agentIn } from '@/features/prompts/prompts';
import { waitingFor } from '@/features/sessions/inbox';
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
import { useProtection } from '@/features/vault/use-protection';
import { shadows, useShape, useTheme, useType } from '@/hooks/use-theme';

export default function HomeScreen() {
  const { connections: allConnections } = useConnections();
  const { shortcuts: allShortcuts } = useShortcuts();
  const { groups } = useGroups();
  const allSessions = useSessions();
  const scopeOf = useProtection();
  const [selectedGroup, setSelectedGroup] = useState(ALL_GROUPS);
  // A shortcut that asks before running, while it asks.
  const [confirming, setConfirming] = useState<Shortcut | null>(null);
  // A deleted group falls back to everything.
  const group = groups.find(({ id }) => id === selectedGroup) ?? null;
  const inGroup = (connectionId: string) =>
    !group || allConnections.some(({ id, groupId }) => id === connectionId && groupId === group.id);
  const connections = allConnections.filter(({ id }) => inGroup(id));
  const shortcuts = allShortcuts.filter(({ connectionId }) => inGroup(connectionId));
  const sessions = allSessions.filter(({ connectionId }) => inGroup(connectionId));
  const manager = useSessionManager();
  const startSession = useStartSession();
  const router = useRouter();
  const theme = useTheme();
  const shape = useShape();
  const { mono, glow } = useType();
  // Small marks keep their slight rounding, except in square themes.
  const mark = (radius: number) => ({ borderRadius: Math.min(radius, shape.radius.small) });

  const openSession = (id: string) => router.push({ pathname: '/session/[id]', params: { id } });
  const start = (target: SessionTarget) => openSession(startSession(target));
  const waiting = allSessions.filter((session) => waitingFor(session)).length;
  const { groups: shortcutGroups, ungrouped } = groupShortcuts(shortcuts);

  const connectionName = (shortcut: Shortcut) =>
    allConnections.find(({ id }) => id === shortcut.connectionId)?.name;
  const run = (shortcut: Shortcut) =>
    start({
      connectionId: shortcut.connectionId,
      name: shortcut.name,
      command: startupCommand(shortcut),
      agent: shortcut.agent?.harness ?? agentIn(shortcut.command),
    });

  const tile = (shortcut: Shortcut) => (
    <ShortcutTile
      key={shortcut.id}
      shortcut={shortcut}
      connectionName={connectionName(shortcut)}
      onRun={() => (shortcut.confirm ? setConfirming(shortcut) : run(shortcut))}
      onEdit={() => router.push({ pathname: '/shortcuts/[id]', params: { id: shortcut.id } })}
    />
  );

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.wordmark}>
          <ThemedText role="heading" aria-label="Flare" style={[styles.brand, mono(600), glow]}>
            flare
          </ThemedText>
          <View
            style={[
              styles.cursor,
              mark(2),
              { backgroundColor: theme.primary, boxShadow: shadows(shape.glowPrimary) },
            ]}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {allSessions.length === 0
            ? 'A terminal for your coding agents'
            : `${allSessions.length} ${allSessions.length === 1 ? 'session' : 'sessions'} open` +
              (waiting ? ` · ${waiting} ${waiting === 1 ? 'needs' : 'need'} you` : '')}
        </ThemedText>
      </View>

      {allConnections.length || groups.length ? (
        <GroupTabs groups={groups} selected={group?.id ?? ALL_GROUPS} onSelect={setSelectedGroup} />
      ) : null}

      {sessions.length ? (
        <Section title="Sessions">
          <Card flush>
            {sessions.map((session, index) => (
              <View key={session.id}>
                {index > 0 ? <Divider inset={Spacing.three + 20} /> : null}
                <View style={styles.row}>
                  {session.attention ? (
                    <View style={[styles.flare, mark(2), { backgroundColor: theme.attention }]} />
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
                        ) : scopeOf(session.connectionId) ? (
                          <Icon name="lock" size={13} />
                        ) : null}
                        <ThemedText
                          type="small"
                          themeColor={session.attention ? 'attention' : 'textSecondary'}
                          numberOfLines={1}
                          style={styles.shrink}>
                          {scopeOf(session.connectionId)
                            ? // A protected session's screen stays out of lists.
                              session.attention
                              ? 'Needs your attention'
                              : STATUS_LABELS[session.status.state]
                            : (session.attention?.body ??
                              session.title ??
                              STATUS_LABELS[session.status.state])}
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

      {allConnections.length ? (
        <>
          {shortcutGroups.map((shortcutGroup) => (
            <Section key={shortcutGroup.name} title={shortcutGroup.name}>
              <View style={styles.grid}>{shortcutGroup.shortcuts.map(tile)}</View>
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

      <Section
        title={group ? group.name : 'Connections'}
        accessory={
          group ? (
            <IconButton
              icon="edit"
              size={16}
              label={`Edit group ${group.name}`}
              onPress={() => router.push({ pathname: '/groups/[id]', params: { id: group.id } })}
            />
          ) : null
        }>
        {group && connections.length === 0 ? (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              No connections in {group.name} yet. Add one here, or pick this group when editing a
              connection.
            </ThemedText>
          </Card>
        ) : connections.length === 0 ? (
          <Card style={styles.empty}>
            <View
              style={[
                styles.window,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  borderRadius: shape.radius.medium,
                  borderWidth: shape.hairline,
                },
              ]}>
              <View style={styles.windowBar}>
                {[0, 1, 2].map((dot) => (
                  <View
                    key={dot}
                    style={[
                      styles.windowDot,
                      {
                        backgroundColor: theme.backgroundSelected,
                        borderRadius: Math.min(shape.radius.dot, 4.5),
                      },
                    ]}
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
                <View
                  style={[styles.promptCursor, mark(1.5), { backgroundColor: theme.primary }]}
                />
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
                    <View
                      style={[
                        styles.monogram,
                        {
                          backgroundColor: theme.backgroundSelected,
                          borderRadius: Math.max(0, shape.radius.medium - 2),
                        },
                      ]}>
                      <ThemedText style={[styles.monogramText, mono(600)]}>
                        {(connection.name.trim()[0] ?? '?').toUpperCase()}
                      </ThemedText>
                    </View>
                    <View style={styles.rowText}>
                      <View style={styles.inline}>
                        <ThemedText type="headline" numberOfLines={1} style={styles.shrink}>
                          {connection.name}
                        </ThemedText>
                        {scopeOf(connection.id) ? <Icon name="lock" size={13} /> : null}
                      </View>
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
          onPress={() =>
            router.push(
              group
                ? { pathname: '/connections/new', params: { groupId: group.id } }
                : '/connections/new'
            )
          }
        />
      </Section>
      {/* A modal: it draws over the screen, whatever its place here. */}
      {confirming ? (
        <ConfirmDialog
          title={`Run ${confirming.name}?`}
          confirmTitle="Run"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            run(confirming);
          }}>
          <ThemedText type="small" themeColor="textSecondary">
            {`On ${connectionName(confirming) ?? 'a missing connection'}, this runs:`}
          </ThemedText>
          <View
            style={[
              styles.well,
              { backgroundColor: theme.backgroundSelected, borderRadius: shape.radius.small },
            ]}>
            <ThemedText type="code" selectable>
              {startupCommand(confirming)}
            </ThemedText>
          </View>
        </ConfirmDialog>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.four + 4 },
  header: { gap: Spacing.half, paddingTop: Spacing.two },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  brand: { fontSize: 30, lineHeight: 38, letterSpacing: -1 },
  cursor: { width: 13, height: 27, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  flare: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3 },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: { fontSize: 17, lineHeight: 22 },
  empty: { gap: Spacing.three - 4, padding: Spacing.three },
  window: {
    paddingBottom: Spacing.three,
    marginBottom: Spacing.one,
  },
  windowBar: { flexDirection: 'row', gap: 6, padding: Spacing.two + 2 },
  windowDot: { width: 9, height: 9 },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  promptText: { fontSize: 15, lineHeight: 22 },
  promptCursor: { width: 9, height: 18, marginLeft: -4 },
  well: { padding: Spacing.three - 2 },
});
