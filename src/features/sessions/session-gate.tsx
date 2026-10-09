import { Link, Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';
import { useLock } from '@/features/vault/lock-provider';
import { UnlockPanel } from '@/features/vault/unlock-panel';
import { useProtection } from '@/features/vault/use-protection';

import type { SessionSnapshot } from './session-manager';
import { useSessions } from './sessions-provider';

/**
 * Shows a session's screens (its terminal, its preview) only once the person may see it:
 * "not found" for a closed session, and the lock for a protected connection or group.
 */
export function SessionGate({
  id,
  children,
}: {
  id: string;
  children: (session: SessionSnapshot) => ReactNode;
}) {
  const session = useSessions().find((candidate) => candidate.id === id);
  const { settings, isAuthorized, authorize } = useLock();
  const scope = useProtection()(session?.connectionId ?? '');

  if (!session) {
    return (
      <Screen centered>
        <ThemedText type="subtitle" role="heading">
          Session not found
        </ThemedText>
        <ThemedText themeColor="textSecondary">It was closed, or the app restarted.</ThemedText>
        <Link href="/">
          <ThemedText type="linkPrimary">Back home</ThemedText>
        </Link>
      </Screen>
    );
  }

  // A protected connection or group asks for the lock each time the person comes back.
  // The session keeps running meanwhile; it just isn't shown.
  if (scope && settings && !isAuthorized(scope)) {
    return (
      <Screen scroll centered edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: session.name }} />
        <UnlockPanel
          title={`Unlock ${session.name}`}
          message={
            scope.startsWith('group:')
              ? 'Its group is protected. It stays connected while locked.'
              : 'This connection is protected. It stays connected while locked.'
          }
          autoBiometrics
          onUnlocked={() => authorize(scope)}
        />
      </Screen>
    );
  }

  return children(session);
}
