import { useEffect, useEffectEvent, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { keyRequestText } from '@/features/ssh/key-request';
import { useLock } from '@/features/vault/lock-provider';
import { UnlockPanel } from '@/features/vault/unlock-panel';
import { useProtection } from '@/features/vault/use-protection';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { shadows, useShape, useTheme } from '@/hooks/use-theme';

import { useSessionManager, useSessions } from './sessions-provider';

/**
 * Asks the person whether a program on a host may use one of their keys (agent forwarding),
 * over whatever screen is up, oldest request first. A plain view rather than a Modal, which
 * would draw above the app lock's screen: a locked app answers nothing until it's unlocked.
 * A protected session's request stays behind its lock too.
 */
export function KeyRequestDialog() {
  const sessions = useSessions();
  const manager = useSessionManager();
  const scopeOf = useProtection();
  const { settings, isAuthorized } = useLock();
  const theme = useTheme();
  const shape = useShape();
  const scrim = useColorScheme() === 'dark' ? `${theme.background}CC` : `${theme.text}59`;
  // The request the person unlocked to see, when its session is protected.
  const [unlockedFor, setUnlockedFor] = useState<number | null>(null);

  const waiting = sessions
    .flatMap((session) => (session.keyRequests ?? []).map((request) => ({ session, request })))
    .sort((a, b) => a.request.at - b.request.at);
  const current = waiting[0];
  const answer = (allowed: boolean) => {
    if (current) manager.answerKeyRequest(current.session.id, current.request.id, allowed);
  };

  const shownId = current?.request.id;
  const denyOnBack = useEffectEvent(() => answer(false));
  useEffect(() => {
    if (shownId === undefined) return;
    // Android's back button denies, rather than leaving the screen underneath.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      denyOnBack();
      return true;
    });
    return () => subscription.remove();
  }, [shownId]);

  if (!current) return null;
  const { session, request } = current;
  const scope = scopeOf(session.connectionId);
  const locked = !!scope && !!settings && !isAuthorized(scope) && unlockedFor !== request.id;
  const text = keyRequestText(request);
  const more = waiting.length - 1;
  // For a request Flare can't read, the safe answer is the one that stands out.
  const unreadable = request.purpose.kind === 'unknown';

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: scrim }]}>
      <View
        role="alertdialog"
        aria-modal
        aria-label={`${session.name} asks to use your key`}
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundRaised,
            borderColor: theme.border,
            borderRadius: shape.radius.large,
            borderWidth: shape.hairline,
            boxShadow: shadows(shape.shadowFloat),
          },
        ]}>
        {locked ? (
          <>
            <UnlockPanel
              title="Unlock to see the request"
              message={`${session.name} asks to use one of your SSH keys. It’s protected, so what it asks stays behind the app lock.`}
              autoBiometrics
              onUnlocked={() => setUnlockedFor(request.id)}
            />
            <Button title="Deny" variant="secondary" onPress={() => answer(false)} />
          </>
        ) : (
          <>
            <View style={styles.heading}>
              <Icon name="key" size={18} color="attention" />
              <ThemedText type="headline" role="heading" style={styles.grow}>
                {session.name} asks to use your key
              </ThemedText>
            </View>
            <View style={styles.group}>
              <ThemedText type="default">{text.action}</ThemedText>
              {text.hostKey ? (
                <ThemedText type="code" themeColor="textSecondary" selectable>
                  {text.hostKey}
                </ThemedText>
              ) : null}
              {text.path ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {text.path}
                </ThemedText>
              ) : null}
            </View>
            {text.warning ? <Callout tone="warning">{text.warning}</Callout> : null}
            <View style={styles.group}>
              <ThemedText type="small" themeColor="textSecondary">
                With {request.key.name} ({request.key.kind})
              </ThemedText>
              <ThemedText type="code" themeColor="textSecondary" selectable>
                {request.key.fingerprint}
              </ThemedText>
            </View>
            <View style={styles.actions}>
              <View style={styles.grow}>
                <Button
                  title="Deny"
                  variant={unreadable ? 'primary' : 'secondary'}
                  onPress={() => answer(false)}
                />
              </View>
              <View style={styles.grow}>
                <Button
                  title="Allow"
                  variant={unreadable ? 'secondary' : 'primary'}
                  onPress={() => answer(true)}
                />
              </View>
            </View>
          </>
        )}
        <ThemedText type="caption" themeColor="textSecondary">
          {`Denied if you don’t answer within a minute.${more ? ` ${more} more waiting.` : ''}`}
        </ThemedText>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: { width: '100%', maxWidth: 420, gap: Spacing.three, padding: Spacing.four },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  group: { gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two + 2, marginTop: Spacing.one },
  grow: { flex: 1 },
});
