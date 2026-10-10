import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useFileNotificationOpens, useNotificationOpens } from '@/features/notifications/notify';
import { useOutboxFiles } from '@/features/outbox/outbox-provider';
import { useProtection } from '@/features/vault/use-protection';
import { shadows, useShape, useTheme } from '@/hooks/use-theme';

import type { SessionSnapshot } from './session-manager';
import { useSessions } from './sessions-provider';

/**
 * Shows the newest alert from a session the person isn't looking at, or a file an agent
 * just sent, and opens sessions and files from tapped system notifications. Home and the
 * inbox list them on their rows instead.
 */
export function AttentionBanner() {
  const sessions = useSessions();
  const files = useOutboxFiles();
  const router = useRouter();
  const theme = useTheme();
  const shape = useShape();
  const insets = useSafeAreaInsets();
  const [dismissedAt, setDismissedAt] = useState(0);
  // Files that came before the app started were listed in the inbox, not announced.
  const [startedAt] = useState(() => Date.now());
  const scopeOf = useProtection();

  const open = (id: string) => router.push({ pathname: '/session/[id]', params: { id } });
  const openFile = (id: string) => router.push({ pathname: '/outbox/[id]', params: { id } });
  useNotificationOpens(open);
  useFileNotificationOpens(openFile);

  // Home and the inbox list alerts themselves.
  const pathname = usePathname();
  const onHome = pathname === '/' || pathname === '/inbox';
  const latest = sessions
    .filter((session) => session.attention && session.attention.at > dismissedAt)
    .sort((a, b) => b.attention!.at - a.attention!.at)[0];
  const file = files.find(
    ({ read, receivedAt }) => !read && receivedAt >= startedAt && receivedAt > dismissedAt
  );
  const alert = latest?.attention
    ? sessionAlert(latest, scopeOf(latest.connectionId) !== null)
    : null;
  const arrival =
    file && pathname !== `/outbox/${file.id}`
      ? {
          at: file.receivedAt,
          title: `${file.host} sent a file`,
          // A protected connection's file name stays behind its lock too.
          body: scopeOf(file.connectionId) ? 'Unlock to read it' : file.name,
          icon: { name: 'file', color: 'textSecondary' } as const,
          label: scopeOf(file.connectionId)
            ? `Read the file from ${file.host}`
            : `Read ${file.name}, from ${file.host}`,
          onOpen: () => openFile(file.id),
        }
      : null;
  const shown =
    alert && (!arrival || alert.at >= arrival.at)
      ? { ...alert, onOpen: () => open(latest!.id) }
      : arrival;
  if (onHome || !shown) return null;

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
            borderRadius: shape.radius.large,
            borderWidth: shape.hairline,
            boxShadow: shadows(shape.shadowFloat),
          },
        ]}>
        <View style={[styles.flare, { backgroundColor: theme.attention }]} />
        <Pressable
          role="button"
          aria-label={shown.label}
          onPress={() => {
            setDismissedAt(shown.at);
            shown.onOpen();
          }}
          style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
          <View
            style={[
              styles.icon,
              { backgroundColor: theme.primaryMuted, borderRadius: shape.radius.pill },
            ]}>
            <Icon name={shown.icon.name} size={16} color={shown.icon.color} />
          </View>
          <View style={styles.text}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {shown.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {shown.body}
            </ThemedText>
          </View>
        </Pressable>
        <Pressable
          role="button"
          aria-label="Dismiss"
          onPress={() => setDismissedAt(shown.at)}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}>
          <ThemedText type="link" themeColor="textSecondary">
            Dismiss
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

/** What the banner says about a session's alert. */
function sessionAlert(session: SessionSnapshot, locked: boolean) {
  const attention = session.attention!;
  // A protected session's message stays behind its lock.
  const body = locked ? 'Needs your attention' : attention.body;
  return {
    at: attention.at,
    title: locked ? session.name : attention.title,
    body,
    icon:
      attention.kind === 'finished'
        ? ({ name: 'check', color: 'success' } as const)
        : ({ name: 'bell', color: 'attention' } as const),
    label: `Go to ${session.name}: ${body}`,
  };
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.three, right: Spacing.three, zIndex: 10 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: Spacing.half },
  dismiss: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  pressed: { opacity: 0.7 },
});
