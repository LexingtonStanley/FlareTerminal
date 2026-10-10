import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';

import { useConnections } from '@/features/connections/connections-provider';
import { postFileNotification } from '@/features/notifications/notify';
import { useSessionManager, useSessions } from '@/features/sessions/sessions-provider';
import { usePreferences } from '@/features/settings/preferences-provider';
import { useProtection } from '@/features/vault/use-protection';

import { OutboxStore, type OutboxFile } from './outbox-store';
import { OutboxWatchers, watchTargets } from './outbox-watcher';

const OutboxContext = createContext<OutboxStore | null>(null);

/** What a notification says about files that just came, newest first, from one host. */
export function arrivalMessage(files: OutboxFile[], locked: boolean) {
  const [newest] = files;
  const title =
    files.length === 1 ? `${newest.host} sent a file` : `${newest.host} sent ${files.length} files`;
  // A protected connection's file names stay behind its lock.
  const body = locked
    ? files.length === 1
      ? 'Open Flare to read it'
      : 'Open Flare to read them'
    : files.length === 1
      ? newest.name
      : `${newest.name} and ${files.length - 1} more`;
  return { title, body };
}

/**
 * Brings files agents save in `~/.flare/outbox/` to the phone, for as long as the app runs:
 * one watcher per SSH host with a connected session (see outbox-watcher.ts). In the
 * background a notification says what came; in front, the attention banner does.
 */
export function OutboxProvider({ children }: PropsWithChildren) {
  const manager = useSessionManager();
  const sessions = useSessions();
  const { connections } = useConnections();
  const { outbox } = usePreferences();
  const scopeOf = useProtection();
  const [store] = useState(() => new OutboxStore());
  const [watchers] = useState(
    () =>
      new OutboxWatchers({
        store,
        run: (sessionId, command, events) => manager.runCommand(sessionId, command, events),
      })
  );

  useEffect(() => {
    watchers.setArrivalHandler((files) => {
      if (manager.isAppActive) return;
      const { connectionId, id } = files[0];
      const { title, body } = arrivalMessage(files, scopeOf(connectionId) !== null);
      postFileNotification(connectionId, title, body, id);
    });
  });

  // Each session change can start or stop a watcher; the same hosts change nothing.
  useEffect(() => {
    watchers.update(outbox ? watchTargets(sessions, connections) : []);
  });

  useEffect(() => () => watchers.stopAll(), [watchers]);

  return <OutboxContext value={store}>{children}</OutboxContext>;
}

export function useOutbox(): OutboxStore {
  const store = use(OutboxContext);
  if (!store) throw new Error('useOutbox must be used inside <OutboxProvider>');
  return store;
}

/** The files agents sent, newest first, re-rendering when one comes or goes. */
export function useOutboxFiles(): OutboxFile[] {
  const store = useOutbox();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
