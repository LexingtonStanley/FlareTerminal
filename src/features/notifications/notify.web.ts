/**
 * The web build shows alerts in the app only (see notify.ts for Android and iOS).
 */

export async function ensureNotificationPermission(): Promise<boolean> {
  return false;
}

export type NotificationAnswer = 'approve' | 'deny';

export function postAgentNotification(
  _sessionId: string,
  _title: string,
  _body: string,
  _questionAt?: number
) {}

export function useNotificationOpens(_onOpen: (sessionId: string) => void) {}

export function useNotificationAnswers(
  _onAnswer: (sessionId: string, questionAt: number, answer: NotificationAnswer) => void
) {}
