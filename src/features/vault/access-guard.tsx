import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { keepsAlive } from '@/features/connections/connections';
import { useConnections } from '@/features/connections/connections-provider';
import { useSessionManager } from '@/features/sessions/sessions-provider';

import { useLock } from './lock-provider';
import { useProtection } from './use-protection';

const SESSION_PATH = /^\/session\/([^/]+)$/;

/**
 * Leaving a session closes the door behind it: a protected connection or group asks for
 * the lock again next time, and a connection set not to keep alive disconnects. Moving
 * between sessions of the same protected group keeps the group open.
 */
export function AccessGuard() {
  const pathname = usePathname();
  const manager = useSessionManager();
  const { connections } = useConnections();
  const { revokeExcept } = useLock();
  const scopeOf = useProtection();

  /** Closes sessions on connections that don't keep alive, except the one on screen. */
  function closeDisposable(keepId: string | null) {
    for (const session of manager.getSnapshot()) {
      if (session.id === keepId) continue;
      const connection = connections.find(({ id }) => id === session.connectionId);
      if (connection && !keepsAlive(connection)) manager.close(session.id);
    }
  }

  // Only on navigation: a session started from Home exists a moment before its screen does.
  useEffect(() => {
    const currentId = SESSION_PATH.exec(pathname)?.[1] ?? null;
    const sessions = manager.getSnapshot();
    const current = sessions.find(({ id }) => id === currentId);
    revokeExcept(current ? scopeOf(current.connectionId) : null);
    closeDisposable(currentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') closeDisposable(null);
    });
    return () => subscription.remove();
  });

  return null;
}
