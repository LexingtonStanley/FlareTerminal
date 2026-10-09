/**
 * Replaces src/features/notifications/notify.ts in router tests, recording what would
 * have been posted:
 *
 *   jest.mock('@/features/notifications/notify', () =>
 *     jest.requireActual('@/test-utils/fake-notify')
 *   );
 */

export const posted: { sessionId: string; title: string; body: string }[] = [];

export async function ensureNotificationPermission() {
  return true;
}

export function postAgentNotification(sessionId: string, title: string, body: string) {
  posted.push({ sessionId, title, body });
}

export function useNotificationOpens(_onOpen: (sessionId: string) => void) {}
