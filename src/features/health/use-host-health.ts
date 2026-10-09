import { useEffect, useState } from 'react';

import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { useSessionManager } from '@/features/sessions/sessions-provider';
import type { Tunnel } from '@/features/terminal/transport';

import { HEALTH_SCRIPT, healthReader, type HostHealth } from './health';

/**
 * The latest health reading of the session's host while it is connected, from one command
 * that runs beside the terminal for as long as the caller is mounted (so the host logs one
 * session, not one every reading). Null until the first reading, and for hosts that can't
 * run it.
 */
export function useHostHealth(session: SessionSnapshot, enabled: boolean): HostHealth | null {
  const manager = useSessionManager();
  const [health, setHealth] = useState<HostHealth | null>(null);
  const connected = session.status.state === 'connected';

  useEffect(() => {
    if (!enabled || !connected) return;
    let command: Tunnel | null = null;
    let cancelled = false;
    const decoder = new TextDecoder();
    const read = healthReader(setHealth);

    // The script goes in on stdin, so the login shell (fish, csh) never parses it.
    manager
      .runCommand(session.id, 'sh -s', {
        onData: (bytes) => read(decoder.decode(bytes, { stream: true })),
        onClose: () => setHealth(null),
      })
      .then(
        (opened) => {
          if (cancelled) return opened.close();
          command = opened;
          opened.write(new TextEncoder().encode(HEALTH_SCRIPT));
        },
        // A host that won't run commands just has no strip.
        () => {}
      );

    return () => {
      cancelled = true;
      command?.close();
    };
  }, [manager, session.id, enabled, connected]);

  return enabled && connected ? health : null;
}
