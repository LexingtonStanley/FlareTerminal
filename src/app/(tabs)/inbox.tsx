import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Divider, Section } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useConnections } from '@/features/connections/connections-provider';
import { formatSize } from '@/features/outbox/outbox';
import { useOutboxFiles } from '@/features/outbox/outbox-provider';
import type { OutboxFile } from '@/features/outbox/outbox-store';
import {
  formatSince,
  inboxGroup,
  waitingFor,
  type InboxGroup,
  type SessionActivity,
} from '@/features/sessions/inbox';
import { answersFor } from '@/features/sessions/prompts';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { STATUS_LABELS, StatusDot } from '@/features/sessions/session-status';
import { useSessionManager, useSessions } from '@/features/sessions/sessions-provider';
import { useProtection } from '@/features/vault/use-protection';
import { useShape, useTheme } from '@/hooks/use-theme';

const GROUPS: { group: InboxGroup; title: string }[] = [
  { group: 'needs-you', title: 'Needs you' },
  { group: 'finished', title: 'Finished' },
  { group: 'working', title: 'Working' },
  { group: 'idle', title: 'Idle' },
];

type Look = { now: number; activity: Map<string, SessionActivity | null> };

/** Files listed before "Show all". */
const RECENT_FILES = 5;

/**
 * Every open session on every host, sorted by what it needs from the person: an agent
 * waiting on them, one that finished, one at work, or a quiet one. Read from each session's own screen, so
 * nothing is installed on the hosts. Below them, the files agents sent to the phone.
 */
export default function InboxScreen() {
  const manager = useSessionManager();
  const sessions = useSessions();
  const { connections } = useConnections();
  const scopeOf = useProtection();
  const router = useRouter();
  const theme = useTheme();
  const { radius } = useShape();
  const files = useOutboxFiles();
  const [allFiles, setAllFiles] = useState(false);
  const unread = files.filter(({ read }) => !read).length;

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
  const finished = count('finished');
  const working = count('working');

  /** When the session last did something that matters for its group. */
  const since = (session: SessionSnapshot, group: InboxGroup) => {
    if (group === 'needs-you' || group === 'finished') {
      const waited = formatSince(now - waitingFor(session)!.since);
      if (waited === 'now') return 'just now';
      return group === 'finished' ? `finished ${waited} ago` : `waiting ${waited}`;
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
    const waiting = group === 'needs-you' || group === 'finished';
    const message = waiting
      ? locked
        ? group === 'finished'
          ? 'Finished'
          : 'Needs your attention'
        : waitingFor(session)!.message
      : null;
    // A question is shown as the message; the screen's last line would be one of its options.
    const shown = locked || group === 'needs-you' ? null : activityOf(session.id)?.preview;
    // A finished agent's message is its last line: no need to show it twice.
    const preview = shown === message ? null : shown;
    const when = since(session, group);
    // Approve and Deny for a yes/no question, except behind a protected connection's lock.
    const { prompt } = session;
    const answerable = !locked && prompt && !prompt.answered && answersFor(prompt) ? prompt : null;
    const answer = (choice: 'approve' | 'deny') => {
      if (answerable) manager.answer(session.id, answerable.at, choice);
    };
    return (
      <View>
        <View style={styles.row}>
          {group === 'needs-you' ? (
            <View
              style={[
                styles.flare,
                { backgroundColor: theme.attention, borderRadius: Math.min(2, radius.small) },
              ]}
            />
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
                  {group === 'finished' ? (
                    <Icon name="check" size={14} color="success" />
                  ) : (
                    <Icon name="bell" size={14} color="attention" />
                  )}
                  <ThemedText
                    type="small"
                    themeColor={group === 'finished' ? 'text' : 'attention'}
                    numberOfLines={2}
                    style={styles.shrink}>
                    {message}
                  </ThemedText>
                </View>
              ) : null}
              {preview ? (
                <View
                  style={[
                    styles.preview,
                    { backgroundColor: theme.backgroundSelected, borderRadius: radius.small },
                  ]}>
                  <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                    {preview}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>
        {answerable ? (
          <View style={styles.answers}>
            <Button
              title="Approve"
              label={`Approve: ${answerable.question}`}
              icon="check"
              variant="secondary"
              size="small"
              onPress={() => answer('approve')}
            />
            <Button
              title="Deny"
              label={`Deny: ${answerable.question}`}
              icon="close"
              variant="secondary"
              size="small"
              onPress={() => answer('deny')}
            />
          </View>
        ) : null}
      </View>
    );
  };

  const fileRow = (file: OutboxFile) => {
    // A protected connection's file names stay out of lists, as its screens do.
    const locked = scopeOf(file.connectionId) !== null;
    const name = locked ? 'A file' : file.name;
    const details = [file.host, formatSize(file.size), sinceText(now - file.receivedAt)];
    return (
      <Pressable
        role="button"
        aria-label={[`Read ${name}`, file.read ? null : 'new', ...details]
          .filter(Boolean)
          .join(', ')}
        onPress={() => router.push({ pathname: '/outbox/[id]', params: { id: file.id } })}
        style={({ pressed }) => [
          styles.rowMain,
          styles.fileRow,
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}>
        <View style={styles.rowLead}>
          <Icon name="file" size={18} color={file.read ? 'textSecondary' : 'text'} />
        </View>
        <View style={styles.rowText}>
          <View style={styles.inline}>
            <ThemedText
              type={file.read ? 'default' : 'headline'}
              numberOfLines={1}
              style={styles.shrink}>
              {name}
            </ThemedText>
            {locked ? <Icon name="lock" size={13} /> : null}
            <View style={styles.grow} />
            {file.read ? null : (
              <View
                style={[styles.unread, { backgroundColor: theme.text, borderRadius: radius.dot }]}
              />
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {details.join(' · ')}
          </ThemedText>
        </View>
      </Pressable>
    );
  };
  const shownFiles = allFiles ? files : files.slice(0, RECENT_FILES);

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.header}>
        <ThemedText type="subtitle" role="heading">
          Inbox
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[
            sessions.length === 0 ? (unread ? null : 'Agents that need you show up here') : null,
            needsYou ? `${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you` : null,
            finished ? `${finished} finished` : null,
            working ? `${working} working` : null,
            sessions.length && !needsYou && !finished && !working ? 'Nothing needs you' : null,
            unread ? `${unread} new ${unread === 1 ? 'file' : 'files'}` : null,
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
              group === 'needs-you' || group === 'finished'
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

      {files.length ? (
        <Section title={`Files from agents · ${files.length}`}>
          <Card flush>
            {shownFiles.map((file, index) => (
              <View key={file.id}>
                {index > 0 ? <Divider inset={Spacing.three + 20} /> : null}
                {fileRow(file)}
              </View>
            ))}
            {files.length > shownFiles.length ? (
              <>
                <Divider inset={Spacing.three + 20} />
                <Pressable
                  role="button"
                  aria-label={`Show all ${files.length} files`}
                  onPress={() => setAllFiles(true)}
                  style={({ pressed }) => [
                    styles.showAll,
                    pressed && { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText type="link" themeColor="textSecondary">
                    Show all {files.length} files
                  </ThemedText>
                </Pressable>
              </>
            ) : null}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

function sinceText(ms: number): string {
  const since = formatSince(ms);
  return since === 'now' ? 'just now' : `${since} ago`;
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.four + 4 },
  header: { gap: Spacing.half, paddingTop: Spacing.two },
  empty: { gap: Spacing.two, padding: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center' },
  flare: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3 },
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
  answers: {
    flexDirection: 'row',
    gap: Spacing.two,
    // Under the row's text, past the status light.
    paddingLeft: Spacing.three + 16 + Spacing.three - 4,
    paddingRight: Spacing.three,
    paddingBottom: Spacing.three - 4,
  },
  fileRow: { minHeight: 56, alignItems: 'center' },
  unread: { width: 8, height: 8 },
  showAll: {
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.three + 20 + Spacing.three - 4,
  },
  preview: {
    marginTop: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
