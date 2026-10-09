import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { StatusDot } from './session-status';
import { useSessions } from './sessions-provider';

/** Tabs for switching between open sessions. A dot marks sessions asking for attention. */
export function SessionStrip({ currentId }: { currentId: string }) {
  const sessions = useSessions();
  const router = useRouter();
  const theme = useTheme();
  if (sessions.length < 2) return null;

  return (
    <View
      role="tablist"
      aria-label="Open sessions"
      style={[styles.bar, { backgroundColor: theme.background, borderColor: theme.border }]}>
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
              style={[
                styles.tab,
                { backgroundColor: current ? theme.backgroundSelected : theme.backgroundElement },
              ]}>
              <StatusDot status={session.status} />
              <Text numberOfLines={1} style={[styles.label, { color: theme.text }]}>
                {session.name}
              </Text>
              {session.attention ? (
                <View style={[styles.attention, { backgroundColor: theme.primary }]} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabs: { gap: Spacing.one, padding: Spacing.one },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: 180,
    minHeight: 32,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  label: { fontSize: 13, fontWeight: 600, flexShrink: 1 },
  attention: { width: 8, height: 8, borderRadius: 4 },
});
