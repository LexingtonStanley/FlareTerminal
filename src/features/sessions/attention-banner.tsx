import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useNotificationOpens } from '@/features/notifications/notify';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProtection } from '@/features/vault/use-protection';
import { useTheme } from '@/hooks/use-theme';

import { useSessions } from './sessions-provider';

/**
 * Shows the newest alert from a session the person isn't looking at, and opens sessions
 * from tapped system notifications. Home and the inbox list alerts on their rows instead.
 */
export function AttentionBanner() {
  const sessions = useSessions();
  const router = useRouter();
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const [dismissedAt, setDismissedAt] = useState(0);
  const scopeOf = useProtection();

  const open = (id: string) => router.push({ pathname: '/session/[id]', params: { id } });
  useNotificationOpens(open);

  // Home and the inbox list alerts themselves.
  const pathname = usePathname();
  const onHome = pathname === '/' || pathname === '/inbox';
  const latest = sessions
    .filter((session) => session.attention && session.attention.at > dismissedAt)
    .sort((a, b) => b.attention!.at - a.attention!.at)[0];
  if (onHome || !latest?.attention) return null;
  // A protected session's message stays behind its lock.
  const attention = scopeOf(latest.connectionId)
    ? { ...latest.attention, title: latest.name, body: 'Needs your attention' }
    : latest.attention;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Spacing.two }]}>
      <View
        role="alert"
        aria-live="polite"
        style={[
          styles.banner,
          {
            backgroundColor: theme.backgroundRaised,
            borderColor: theme.border,
            boxShadow: `0 8px 24px ${theme.shadow}${dark ? '99' : '26'}`,
          },
        ]}>
        <View style={[styles.flare, { backgroundColor: theme.attention }]} />
        <Pressable
          role="button"
          aria-label={`Go to ${latest.name}: ${attention.body}`}
          onPress={() => {
            setDismissedAt(attention.at);
            open(latest.id);
          }}
          style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
          <View style={[styles.icon, { backgroundColor: theme.primaryMuted }]}>
            <Icon name="bell" size={16} color="attention" />
          </View>
          <View style={styles.text}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {attention.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {attention.body}
            </ThemedText>
          </View>
        </Pressable>
        <Pressable
          role="button"
          aria-label="Dismiss"
          onPress={() => setDismissedAt(attention.at)}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}>
          <ThemedText type="link" themeColor="textSecondary">
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
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  flare: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 4,
    paddingLeft: Spacing.three,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: Spacing.half },
  dismiss: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  pressed: { opacity: 0.7 },
});
