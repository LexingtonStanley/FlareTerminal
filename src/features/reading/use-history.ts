import { useEffect, useEffectEvent, useState } from 'react';

import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { useSessionManager } from '@/features/sessions/sessions-provider';
import type { Tunnel } from '@/features/terminal/transport';

import { parseReading, readingScript, type HistorySource } from './capture';
import { bufferLines, parseAnsi, type StyledLine } from './history';

/**
 * Why a history is this screen's rather than the multiplexer's: none was asked for, the
 * connection can't run commands (ttyd), it isn't connected, the host took too long, or the
 * session wasn't there.
 */
export type ScreenReason = 'no source' | 'no commands' | 'offline' | 'no answer' | 'not found';

export type History = {
  lines: StyledLine[];
  /** Read from tmux or zellij on the host, or from this screen and its scrollback. */
  from: { kind: 'host' } | { kind: 'screen'; reason: ScreenReason };
  /** The host's tmux and zellij sessions. */
  sessions: HistorySource[];
};

/** How long the host gets to answer before reading mode shows the screen instead. */
export const READ_TIMEOUT_MS = 15_000;

/**
 * A session's history: from `source` on the host when it can be read (over SSH, beside the
 * terminal), otherwise what the app kept of the screen. Read again when `attempt` changes.
 * `history` is null while reading; `last` is the last one read, whatever its source.
 */
export function useHistory(
  session: SessionSnapshot,
  source: HistorySource | null,
  attempt: number
): { history: History | null; last: History | null } {
  const manager = useSessionManager();
  const connected = useEffectEvent(() => session.status.state === 'connected');
  const kind = source?.kind;
  const name = source?.session;
  const key = `${kind}:${name}:${attempt}`;
  const [read, setRead] = useState<{ key: string; history: History } | null>(null);

  useEffect(() => {
    const wanted = kind && name !== undefined ? { kind, session: name } : null;
    const readKey = `${kind}:${name}:${attempt}`;
    let cancelled = false;
    let command: Tunnel | null = null;
    let done = false;
    const chunks: string[] = [];
    const decoder = new TextDecoder();

    const show = (history: History) => {
      if (!cancelled) setRead({ key: readKey, history });
    };
    const showScreen = (reason: ScreenReason, sessions: HistorySource[] = []) => {
      const terminal = manager.screen(session.id);
      const lines = terminal ? bufferLines(terminal.buffer.active) : [];
      while (lines.length && lines[lines.length - 1].length === 0) lines.pop();
      show({ lines, from: { kind: 'screen', reason: wanted ? reason : 'no source' }, sessions });
    };
    const end = (outcome: 'finished' | ScreenReason) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (outcome !== 'finished') return showScreen(outcome);
      chunks.push(decoder.decode());
      const { sessions, history } = parseReading(chunks.join(''));
      if (wanted && history !== null) {
        show({ lines: parseAnsi(history), from: { kind: 'host' }, sessions });
      } else {
        showScreen('not found', sessions);
      }
    };
    const timer = setTimeout(() => {
      command?.close();
      end('no answer');
    }, READ_TIMEOUT_MS);

    // The script goes in on stdin, so the login shell (fish, csh) never parses it.
    manager
      .runCommand(session.id, 'sh -s', {
        onData: (bytes) => chunks.push(decoder.decode(bytes, { stream: true })),
        onClose: () => end('finished'),
      })
      .then(
        (opened) => {
          if (cancelled) return opened.close();
          command = opened;
          opened.write(new TextEncoder().encode(readingScript(wanted)));
        },
        // ttyd, or not connected: the screen is all there is.
        () => end(connected() ? 'no commands' : 'offline')
      );

    return () => {
      cancelled = true;
      clearTimeout(timer);
      command?.close();
    };
  }, [manager, session.id, kind, name, attempt]);

  return { history: read?.key === key ? read.history : null, last: read?.history ?? null };
}
