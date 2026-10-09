import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNotificationOpens } from '@/features/notifications/notify';
import { useTheme } from '@/hooks/use-theme';

import { useSessions } from './sessions-provider';

/**
 * Shows the newest alert from a session the person isn't looking at, and opens sessions
 * from tapped system notifications. Home lists alerts on its session rows instead.
 */
export function AttentionBanner() {
  const sessions = useSessions();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [dismissedAt, setDismissedAt] = useState(0);

  const open = (id: string) => router.push({ pathname: '/session/[id]', params: { id } });
  useNotificationOpens(open);

  const onHome = usePathname() === '/';
  const latest = sessions
    .filter((session) => session.attention && session.attention.at > dismissedAt)
    .sort((a, b) => b.attention!.at - a.attention!.at)[0];
  if (onHome || !latest?.attention) return null;
  const { attention } = latest;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Spacing.two }]}>
      <View
        role="alert"
        aria-live="polite"
        style={[
          styles.banner,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            shadowColor: theme.shadow,
          },
        ]}>
        <Pressable
          role="button"
          aria-label={`Go to ${latest.name}: ${attention.body}`}
          onPress={() => {
            setDismissedAt(attention.at);
            open(latest.id);
          }}
          style={styles.body}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {attention.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {attention.body}
          </ThemedText>
        </Pressable>
        <Pressable
          role="button"
          aria-label="Dismiss"
          onPress={() => setDismissedAt(attention.at)}
          style={styles.dismiss}>
          <ThemedText type="small" themeColor="primary">
            Dismiss
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.three, right: Spacing.three, zIndex: 10 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  body: { flex: 1, gap: Spacing.half, padding: Spacing.three },
  dismiss: { padding: Spacing.three },
});
