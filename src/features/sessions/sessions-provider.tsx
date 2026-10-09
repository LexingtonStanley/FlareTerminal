import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform } from 'react-native';

import { useConnections } from '@/features/connections/connections-provider';
import {
  ensureNotificationPermission,
  postAgentNotification,
} from '@/features/notifications/notify';
import { openTransport } from '@/features/terminal/open-transport';

import { SessionManager, type SessionTarget } from './session-manager';

const SessionsContext = createContext<SessionManager | null>(null);

/** Owns the app's terminal sessions for as long as the app runs. */
export function SessionsProvider({ children }: PropsWithChildren) {
  const { connections, getPassword } = useConnections();
  const [manager] = useState(
    () =>
      new SessionManager({
        // Replaced below once the saved connections are known.
        openTransport: () => null,
        onAttention(session, attention, appActive) {
          // In the foreground the in-app banner shows it instead.
          if (!appActive) postAgentNotification(session.id, attention.title, attention.body);
        },
      })
  );

  // Sessions connect when their view attaches, which is always after this effect.
  useEffect(() => {
    manager.setTransportOpener((connectionId, listener) => {
      const connection = connections.find(({ id }) => id === connectionId);
      return connection ? openTransport(connection, getPassword(connection.id), listener) : null;
    });
  }, [manager, connections, getPassword]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      manager.setAppActive(state === 'active')
    );
    return () => {
      subscription.remove();
      manager.closeAll();
    };
  }, [manager]);

  return <SessionsContext value={manager}>{children}</SessionsContext>;
}

export function useSessionManager(): SessionManager {
  const manager = use(SessionsContext);
  if (!manager) throw new Error('useSessionManager must be used inside <SessionsProvider>');
  return manager;
}

/** All open sessions, re-rendering when any of them changes. */
export function useSessions() {
  const manager = useSessionManager();
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
}

/** Starts a session; asks for notification permission the first time (Android/iOS). */
export function useStartSession() {
  const manager = useSessionManager();
  return (target: SessionTarget) => {
    if (Platform.OS !== 'web') void ensureNotificationPermission();
    return manager.start(target);
  };
}
