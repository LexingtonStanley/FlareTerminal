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

export function postKeyNotification(_sessionId: string, _title: string, _body: string) {}

export function dismissKeyNotification(_sessionId: string) {}

export function postFileNotification(
  _connectionId: string,
  _title: string,
  _body: string,
  _fileId: string
) {}

export function useFileNotificationOpens(_onOpen: (fileId: string) => void) {}

export function useNotificationOpens(_onOpen: (sessionId: string) => void) {}

export function useNotificationAnswers(
  _onAnswer: (sessionId: string, questionAt: number, answer: NotificationAnswer) => void
) {}
