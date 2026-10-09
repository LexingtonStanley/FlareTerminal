import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useSessionManager } from '@/features/sessions/sessions-provider';

import { startForward, tunnelErrorMessage, type Forward, type OpenTunnel } from './forward';
import { listenLocal } from './local-server';

export type ForwardState =
  | { state: 'starting' }
  /** `error`: why the last request couldn't reach the host, until the next load. */
  | { state: 'ready'; localPort: number; error: string | null }
  | { state: 'failed'; message: string };

/**
 * Forwards `port` on the session's host to the phone while the calling screen is open
 * (`host` names the host in messages). Remount to try again.
 */
export function usePortForward(sessionId: string, port: number, host: string) {
  const manager = useSessionManager();
  const [state, setState] = useState<ForwardState>({ state: 'starting' });

  useEffect(() => {
    let forward: Forward | null = null;
    let cancelled = false;
    const openTunnel: OpenTunnel = (events) => manager.openTunnel(sessionId, port, events);
    const message = (error: unknown) => tunnelErrorMessage(error, port, host);
    const listen = (localPort: number) =>
      startForward({
        port: localPort,
        listen: listenLocal,
        openTunnel,
        onError: (error) =>
          setState((current) =>
            current.state === 'ready' ? { ...current, error: message(error) } : current
          ),
      });
    const ready = (started: Forward) => {
      if (cancelled) return started.stop();
      forward = started;
      setState({ state: 'ready', localPort: started.localPort, error: null });
    };
    const fail = (error: unknown) => {
      if (!cancelled) setState({ state: 'failed', message: message(error) });
    };

    void (async () => {
      try {
        // Ask the host once first, so a dev server that isn't running gets a message
        // rather than a blank page.
        (await openTunnel({ onData: () => {}, onClose: () => {} })).close();
        ready(await listen(port));
      } catch (error) {
        fail(error);
      }
    })();

    // iOS can take back a listening socket while the app is suspended (Apple's TN2277),
    // leaving a port nothing answers on. Listen again, on the same port, when it returns.
    let away = false;
    const subscription =
      Platform.OS === 'ios'
        ? AppState.addEventListener('change', (next) => {
            if (next === 'background') away = true;
            if (next !== 'active' || !away) return;
            away = false;
            // Still starting: it listens after this anyway.
            if (!forward) return;
            const previous = forward;
            forward = null;
            previous.stop();
            listen(previous.localPort).then(ready, fail);
          })
        : null;

    return () => {
      cancelled = true;
      subscription?.remove();
      forward?.stop();
    };
  }, [manager, sessionId, port, host]);

  const clearError = () =>
    setState((current) => (current.state === 'ready' ? { ...current, error: null } : current));
  return [state, clearError] as const;
}
