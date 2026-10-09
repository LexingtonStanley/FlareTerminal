/**
 * Replaces src/features/notifications/notify.ts in router tests, recording what would
 * have been posted:
 *
 *   jest.mock('@/features/notifications/notify', () =>
 *     jest.requireActual('@/test-utils/fake-notify')
 *   );
 */

export type NotificationAnswer = 'approve' | 'deny';

export const posted: { sessionId: string; title: string; body: string; questionAt?: number }[] = [];

let answerHandler:
  ((sessionId: string, questionAt: number, answer: NotificationAnswer) => void) | null = null;

/** Plays the person tapping Approve or Deny on a posted notification. */
export function tapAnswer(notification: (typeof posted)[number], answer: NotificationAnswer) {
  if (notification.questionAt === undefined) throw new Error('That notification has no answers');
  answerHandler?.(notification.sessionId, notification.questionAt, answer);
}

export async function ensureNotificationPermission() {
  return true;
}

export function postAgentNotification(
  sessionId: string,
  title: string,
  body: string,
  questionAt?: number
) {
  posted.push({ sessionId, title, body, ...(questionAt === undefined ? {} : { questionAt }) });
}

export function useNotificationOpens(_onOpen: (sessionId: string) => void) {}

export function useNotificationAnswers(
  onAnswer: (sessionId: string, questionAt: number, answer: NotificationAnswer) => void
) {
  answerHandler = onAnswer;
}
