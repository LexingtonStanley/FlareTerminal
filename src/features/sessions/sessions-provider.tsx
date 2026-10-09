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
  useNotificationAnswers,
} from '@/features/notifications/notify';
import { openTransport } from '@/features/terminal/open-transport';
import { useProtection } from '@/features/vault/use-protection';

import { keepSessionsAlive } from './background';
import { answersFor } from './prompts';
import { SessionManager, type SessionTarget } from './session-manager';

const SessionsContext = createContext<SessionManager | null>(null);

/** Owns the app's terminal sessions for as long as the app runs. */
export function SessionsProvider({ children }: PropsWithChildren) {
  const { connections, getPassword } = useConnections();
  const [manager] = useState(
    () =>
      new SessionManager({
        // Both replaced below once the saved connections are known.
        openTransport: () => null,
        onAttention: () => {},
      })
  );
  const scopeOf = useProtection();

  // Sessions connect when their view attaches, which is always after this effect.
  useEffect(() => {
    manager.setTransportOpener((connectionId, listener) => {
      const connection = connections.find(({ id }) => id === connectionId);
      return connection ? openTransport(connection, getPassword(connection.id), listener) : null;
    });
  }, [manager, connections, getPassword]);

  useEffect(() => {
    manager.setAttentionHandler((session, attention, appActive) => {
      // In the foreground the in-app banner shows it instead.
      if (appActive) return;
      // A protected session's message stays behind its lock, off the lock screen too, and
      // it can't be answered from there.
      if (scopeOf(session.connectionId)) {
        postAgentNotification(session.id, session.name, 'Needs your attention');
        return;
      }
      const { prompt } = session;
      const answerable = prompt && !prompt.answered && answersFor(prompt) ? prompt.at : undefined;
      postAgentNotification(session.id, attention.title, attention.body, answerable);
    });
  });

  // Approve or Deny on a notification types the answer, if the question is still on screen.
  useNotificationAnswers((sessionId, questionAt, answer) => {
    const session = manager.getSnapshot().find(({ id }) => id === sessionId);
    if (!session || scopeOf(session.connectionId)) return;
    const result = manager.answer(sessionId, questionAt, answer);
    if (result === 'disconnected') {
      postAgentNotification(
        sessionId,
        session.name,
        'Not sent: disconnected. Open Flare to reconnect.'
      );
    } else if (result === 'gone') {
      postAgentNotification(
        sessionId,
        session.name,
        'Not sent: that question is no longer on screen.'
      );
    }
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      manager.setAppActive(state === 'active')
    );
    return () => {
      subscription.remove();
      manager.closeAll();
      keepSessionsAlive(0);
    };
  }, [manager]);

  // Keep the app running in the background while any session is connected (Android).
  const sessions = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot
  );
  const live = sessions.filter(
    ({ status, reconnecting }) => status.state !== 'closed' || reconnecting
  ).length;
  useEffect(() => keepSessionsAlive(live), [live]);

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
