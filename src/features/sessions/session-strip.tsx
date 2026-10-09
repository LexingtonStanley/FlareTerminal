import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useConnections } from '@/features/connections/connections-provider';
import { groupOf } from '@/features/groups/groups';
import { useGroups } from '@/features/groups/groups-provider';
import { shadows, useShape, useTheme, useType } from '@/hooks/use-theme';

import { StatusDot } from './session-status';
import { useSessions } from './sessions-provider';

/**
 * Tabs for switching between the open sessions of the current session's group (or of
 * ungrouped connections). The one on screen carries the ember underline; an ember dot marks
 * sessions asking for attention.
 */
export function SessionStrip({ currentId }: { currentId: string }) {
  const { connections } = useConnections();
  const { groups } = useGroups();
  const groupIdOf = (connectionId: string) =>
    groupOf(
      connections.find(({ id }) => id === connectionId),
      groups
    )?.id ?? null;
  const all = useSessions();
  const current = all.find(({ id }) => id === currentId);
  const sessions = current
    ? all.filter(({ connectionId }) => groupIdOf(connectionId) === groupIdOf(current.connectionId))
    : all;
  const router = useRouter();
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();
  if (sessions.length < 2) return null;

  return (
    <View
      role="tablist"
      aria-label="Open sessions"
      style={[
        {
          backgroundColor: theme.background,
          borderColor: theme.border,
          borderBottomWidth: shape.hairline,
        },
      ]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}>
        {sessions.map((session) => {
          const current = session.id === currentId;
          return (
            <Pressable
              key={session.id}
              role="tab"
              aria-selected={current}
              aria-label={`${session.name}${session.attention ? ', needs attention' : ''}`}
              onPress={() =>
                current || router.replace({ pathname: '/session/[id]', params: { id: session.id } })
              }
              style={({ pressed }) => [
                styles.tab,
                {
                  backgroundColor:
                    current || pressed ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: current ? theme.border : 'transparent',
                  borderRadius: Math.min(shape.radius.small + 2, shape.radius.small * 2),
                  borderWidth: shape.hairline,
                },
              ]}>
              <StatusDot status={session.status} />
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  sans(500),
                  { color: current ? theme.text : theme.textSecondary },
                ]}>
                {session.name}
              </Text>
              {session.attention ? (
                <View
                  style={[
                    styles.attention,
                    {
                      backgroundColor: theme.attention,
                      borderRadius: Math.min(shape.radius.dot, 3.5),
                    },
                  ]}
                />
              ) : null}
              {current ? (
                <View
                  style={[
                    styles.underline,
                    { backgroundColor: theme.primary, boxShadow: shadows(shape.glowPrimary) },
                  ]}
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: Spacing.one + 2, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one + 2 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    maxWidth: 180,
    minHeight: 34,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.three - 4,
    overflow: 'hidden',
  },
  label: { fontSize: 13, flexShrink: 1 },
  attention: { width: 7, height: 7, marginLeft: Spacing.one },
  underline: {
    position: 'absolute',
    left: Spacing.three - 4,
    right: Spacing.three - 4,
    bottom: 0,
    height: 2,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});
