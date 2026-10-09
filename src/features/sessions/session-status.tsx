import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { SessionStatus } from '@/features/terminal/transport';
import { useTheme } from '@/hooks/use-theme';

export const STATUS_LABELS: Record<SessionStatus['state'], string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  closed: 'Disconnected',
};

export function useStatusColor(status: SessionStatus) {
  const theme = useTheme();
  return status.state === 'connected'
    ? theme.success
    : status.state === 'closed'
      ? theme.danger
      : theme.textSecondary;
}

export function StatusDot({ status }: { status: SessionStatus }) {
  return <View style={[styles.dot, { backgroundColor: useStatusColor(status) }]} />;
}

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <View style={styles.badge} aria-label={`Status: ${STATUS_LABELS[status.state]}`}>
      <StatusDot status={status} />
      <ThemedText type="small" themeColor="textSecondary">
        {STATUS_LABELS[status.state]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
