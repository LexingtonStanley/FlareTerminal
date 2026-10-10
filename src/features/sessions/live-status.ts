import { formatSince, waitingFor } from './inbox';
import type { SessionSnapshot } from './session-manager';

/**
 * The live status: what the ongoing notification says while sessions are open on Android,
 * so a look at the notification shade says which agents need you, which are working (and
 * for how long) and which finished, without opening the app.
 */

export type LiveStatus = { title: string; text: string };

export type LiveSession = Pick<
  SessionSnapshot,
  'name' | 'status' | 'attention' | 'prompt' | 'reconnecting' | 'workingSince'
> & {
  /** Its connection or group is protected: no name or screen text leaves the app. */
  hidden: boolean;
};

/** How often the status is redrawn while an agent works, for its time. */
export const LIVE_TICK_MS = 60_000;

const plural = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

/** Names a list can show: the unprotected ones. */
const names = (sessions: LiveSession[]) =>
  sessions.filter(({ hidden }) => !hidden).map(({ name }) => name);

function workedFor(session: LiveSession, now: number): string {
  const since = formatSince(now - (session.workingSince ?? now));
  return since === 'now' ? 'just started' : since;
}

/** The status for these sessions, or null when none is open. */
export function liveStatus(sessions: LiveSession[], now: number): LiveStatus | null {
  const live = sessions.filter(
    ({ status, reconnecting }) => status.state !== 'closed' || reconnecting
  );
  if (!live.length) return null;

  const needs: { session: LiveSession; message: string }[] = [];
  const finished: { session: LiveSession; message: string }[] = [];
  const working: LiveSession[] = [];
  for (const session of live) {
    const waiting = waitingFor(session);
    if (waiting?.kind === 'finished') finished.push({ session, message: waiting.message });
    else if (waiting) needs.push({ session, message: waiting.message });
    else if (session.status.state === 'connected' && session.workingSince) working.push(session);
  }
  working.sort((a, b) => (a.workingSince ?? 0) - (b.workingSince ?? 0));

  const workingLine = () =>
    working.length === 1 && !working[0].hidden
      ? `${working[0].name} working ${workedFor(working[0], now)}`
      : plural(working.length, 'working', 'working');
  const finishedLine = () => plural(finished.length, 'finished', 'finished');
  const rest = (...lines: (string | false)[]) => lines.filter(Boolean).join(' · ');

  if (needs.length) {
    const [{ session, message }] = needs;
    const shown = names(needs.map(({ session: needing }) => needing));
    return {
      title:
        needs.length > 1
          ? `${needs.length} sessions need you`
          : session.hidden
            ? 'A session needs you'
            : `${session.name} needs you`,
      text: rest(
        needs.length > 1 ? shown.join(', ') : !session.hidden && message,
        working.length > 0 && workingLine(),
        finished.length > 0 && finishedLine()
      ),
    };
  }
  if (working.length) {
    const [first] = working;
    return {
      title:
        working.length > 1
          ? `${working.length} agents working`
          : first.hidden
            ? 'An agent is working'
            : `${first.name} is working`,
      text: rest(
        working.length > 1
          ? working
              .filter(({ hidden }) => !hidden)
              .map((session) => `${session.name} ${workedFor(session, now)}`)
              .join(', ')
          : workedFor(first, now) === 'just started'
            ? 'Just started'
            : `For ${workedFor(first, now)}`,
        finished.length > 0 && finishedLine()
      ),
    };
  }
  if (finished.length) {
    const [{ session, message }] = finished;
    return {
      title:
        finished.length > 1
          ? `${finished.length} agents finished`
          : session.hidden
            ? 'An agent finished'
            : `${session.name} finished`,
      text:
        finished.length > 1
          ? names(finished.map(({ session: done }) => done)).join(', ')
          : session.hidden
            ? ''
            : message,
    };
  }
  return {
    title: 'Flare Terminal',
    text: plural(live.length, 'session connected', 'sessions connected'),
  };
}
