/**
 * The web build shows alerts in the app only (see notify.ts for Android and iOS).
 */

export async function ensureNotificationPermission(): Promise<boolean> {
  return false;
}

export function postAgentNotification(_sessionId: string, _title: string, _body: string) {}

export function useNotificationOpens(_onOpen: (sessionId: string) => void) {}
