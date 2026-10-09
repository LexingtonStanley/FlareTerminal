import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Divider, Section } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useConnections } from '@/features/connections/connections-provider';
import {
  formatSince,
  inboxGroup,
  waitingFor,
  type InboxGroup,
  type SessionActivity,
} from '@/features/sessions/inbox';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { STATUS_LABELS, StatusDot } from '@/features/sessions/session-status';
import { useSessionManager, useSessions } from '@/features/sessions/sessions-provider';
import { useProtection } from '@/features/vault/use-protection';
import { useTheme } from '@/hooks/use-theme';

const GROUPS: { group: InboxGroup; title: string }[] = [
  { group: 'needs-you', title: 'Needs you' },
  { group: 'working', title: 'Working' },
  { group: 'idle', title: 'Idle' },
];

type Look = { now: number; activity: Map<string, SessionActivity | null> };

/**
 * Every open session on every host, sorted by what it needs from the person: an agent
 * waiting on them, one at work, or a quiet one. Read from each session's own screen, so
 * nothing is installed on the hosts.
 */
export default function InboxScreen() {
  const manager = useSessionManager();
  const sessions = useSessions();
  const { connections } = useConnections();
  const scopeOf = useProtection();
  const router = useRouter();
  const theme = useTheme();

  // Screens are read once a second while the inbox is on screen, not on every write.
  const [look, setLook] = useState<Look>(() => ({ now: Date.now(), activity: new Map() }));
  useFocusEffect(
    useCallback(() => {
      const read = () =>
        setLook({
          now: Date.now(),
          activity: new Map(manager.getSnapshot().map(({ id }) => [id, manager.activity(id)])),
        });
      read();
      const timer = setInterval(read, 1000);
      return () => clearInterval(timer);
    }, [manager])
  );

  const { now } = look;
  const activityOf = (id: string) => look.activity.get(id) ?? null;
  const groupOf = (session: SessionSnapshot) => inboxGroup(session, activityOf(session.id), now);
  const count = (group: InboxGroup) => sessions.filter((s) => groupOf(s) === group).length;
  const needsYou = count('needs-you');
  const working = count('working');

  /** When the session last did something that matters for its group. */
  const since = (session: SessionSnapshot, group: InboxGroup) => {
    if (group === 'needs-you') {
      const waited = formatSince(now - waitingFor(session)!.since);
      return waited === 'now' ? 'just now' : `waiting ${waited}`;
    }
    if (group === 'working') return 'active';
    if (session.reconnecting) return 'reconnecting';
    if (session.status.state !== 'connected') return STATUS_LABELS[session.status.state];
    const activity = activityOf(session.id);
    return activity ? `quiet ${formatSince(now - activity.changedAt)}` : '';
  };

  const row = (session: SessionSnapshot, group: InboxGroup) => {
    const connection = connections.find(({ id }) => id === session.connectionId);
    const host = connection && connection.name !== session.name ? connection.name : null;
    // A protected session's screen stays out of lists.
    const locked = scopeOf(session.connectionId) !== null;
    const preview = locked ? null : activityOf(session.id)?.preview;
    const message =
      group === 'needs-you'
        ? locked
          ? 'Needs your attention'
          : waitingFor(session)!.message
        : null;
    const when = since(session, group);
    return (
      <View style={styles.row}>
        {group === 'needs-you' ? (
          <View style={[styles.flare, { backgroundColor: theme.attention }]} />
        ) : null}
        <Pressable
          role="button"
          aria-label={[`Open ${session.name}`, host, message, preview, when]
            .filter(Boolean)
            .join(', ')}
          onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
          style={({ pressed }) => [
            styles.rowMain,
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}>
          <View style={styles.rowLead}>
            <StatusDot status={session.status} />
          </View>
          <View style={styles.rowText}>
            <View style={styles.inline}>
              <ThemedText type="headline" numberOfLines={1} style={styles.shrink}>
                {session.name}
              </ThemedText>
              {locked ? <Icon name="lock" size={13} /> : null}
              <View style={styles.grow} />
              <ThemedText
                type="caption"
                themeColor={group === 'needs-you' ? 'attention' : 'textSecondary'}>
                {when}
              </ThemedText>
            </View>
            {host ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {host}
              </ThemedText>
            ) : null}
            {message ? (
              <View style={styles.inline}>
                <Icon name="bell" size={14} color="attention" />
                <ThemedText
                  type="small"
                  themeColor="attention"
                  numberOfLines={2}
                  style={styles.shrink}>
                  {message}
                </ThemedText>
              </View>
            ) : null}
            {preview ? (
              <View style={[styles.preview, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                  {preview}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.header}>
        <ThemedText type="subtitle" role="heading">
          Inbox
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sessions.length === 0
            ? 'Agents that need you show up here'
            : [
                needsYou ? `${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you` : null,
                working ? `${working} working` : null,
                !needsYou && !working ? 'Nothing needs you' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        </ThemedText>
      </View>

      {sessions.length === 0 ? (
        <Card style={styles.empty}>
          <Icon name="inbox" size={28} />
          <ThemedText type="headline">No sessions open</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Start an agent from a shortcut on Home. Every session on every computer is listed here,
            with the ones waiting for you at the top.
          </ThemedText>
        </Card>
      ) : (
        GROUPS.map(({ group, title }) => {
          const members = sessions
            .filter((session) => groupOf(session) === group)
            .sort((a, b) =>
              group === 'needs-you'
                ? waitingFor(a)!.since - waitingFor(b)!.since
                : (activityOf(b.id)?.changedAt ?? 0) - (activityOf(a.id)?.changedAt ?? 0)
            );
          if (!members.length) return null;
          return (
            <Section key={group} title={`${title} · ${members.length}`}>
              <Card flush>
                {members.map((session, index) => (
                  <View key={session.id}>
                    {index > 0 ? <Divider inset={Spacing.three + 20} /> : null}
                    {row(session, group)}
                  </View>
                ))}
              </Card>
            </Section>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.four + 4 },
  header: { gap: Spacing.half, paddingTop: Spacing.two },
  empty: { gap: Spacing.two, padding: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center' },
  flare: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2 },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.three,
    minHeight: 64,
  },
  rowLead: { width: 16, alignItems: 'center', paddingTop: 3 },
  rowText: { flex: 1, gap: Spacing.half },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  shrink: { flexShrink: 1 },
  grow: { flex: 1 },
  preview: {
    marginTop: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.small,
  },
});
