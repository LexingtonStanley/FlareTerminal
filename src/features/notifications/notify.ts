import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Local notifications for agent alerts, posted when the app is in the background.
 * (In the foreground the app shows its own banner.) Android and iOS suspend apps soon
 * after they leave the screen, which also ends SSH connections, so alerts reach the
 * phone only while the app is open or recently left; tmux keeps the agents running.
 */

const CHANNEL_ID = 'agents';
/** Notifications for a yes/no question carry Approve and Deny (no ':' or '-' allowed). */
const QUESTION_CATEGORY = 'agentQuestion';

export type NotificationAnswer = 'approve' | 'deny';

let configured = false;

function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  // Answered without opening the app. iOS asks for the phone's unlock first, so a locked
  // phone can't approve anything; Android follows the phone's lock-screen settings.
  void Notifications.setNotificationCategoryAsync(QUESTION_CATEGORY, [
    {
      identifier: 'approve',
      buttonTitle: 'Approve',
      options: { opensAppToForeground: false, isAuthenticationRequired: true },
    },
    {
      identifier: 'deny',
      buttonTitle: 'Deny',
      options: { opensAppToForeground: false, isAuthenticationRequired: true, isDestructive: true },
    },
  ]);
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Agent alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

/** Asks once; later calls return the stored answer. Never throws: alerts are optional. */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    configure();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const identifierOf = (sessionId: string) => `agent-${sessionId}`;

/**
 * Posts (or replaces) a session's notification. With `questionAt`, the time of a yes/no
 * question on its screen, it carries Approve and Deny.
 */
export function postAgentNotification(
  sessionId: string,
  title: string,
  body: string,
  questionAt?: number
) {
  configure();
  void Notifications.scheduleNotificationAsync({
    // One notification per session: a newer alert replaces the older one.
    identifier: identifierOf(sessionId),
    content: {
      title,
      body,
      data: { sessionId, questionAt: questionAt ?? null },
      ...(questionAt === undefined ? {} : { categoryIdentifier: QUESTION_CATEGORY }),
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

/**
 * Posts (or replaces) a host's notification for files its agents sent; a tap opens `fileId`.
 */
export function postFileNotification(
  connectionId: string,
  title: string,
  body: string,
  fileId: string
) {
  configure();
  void Notifications.scheduleNotificationAsync({
    // One per host: files that arrive later replace it.
    identifier: `outbox-${connectionId}`,
    content: { title, body, data: { fileId } },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

/** Calls `onOpen` with the file's id when the person taps a file's notification. */
export function useFileNotificationOpens(onOpen: (fileId: string) => void) {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const fileId = response.notification.request.content.data?.fileId;
      if (typeof fileId === 'string') onOpen(fileId);
    });
    return () => subscription.remove();
  }, [onOpen]);
}

/** Calls `onOpen` with the session id when the person taps one of our notifications. */
export function useNotificationOpens(onOpen: (sessionId: string) => void) {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const sessionId = response.notification.request.content.data?.sessionId;
      if (typeof sessionId === 'string') onOpen(sessionId);
    });
    return () => subscription.remove();
  }, [onOpen]);
}

/** Calls `onAnswer` when the person taps Approve or Deny, and clears that notification. */
export function useNotificationAnswers(
  onAnswer: (sessionId: string, questionAt: number, answer: NotificationAnswer) => void
) {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const answer = response.actionIdentifier;
      if (answer !== 'approve' && answer !== 'deny') return;
      const { sessionId, questionAt } = response.notification.request.content.data ?? {};
      if (typeof sessionId !== 'string' || typeof questionAt !== 'number') return;
      void Notifications.dismissNotificationAsync(identifierOf(sessionId));
      onAnswer(sessionId, questionAt, answer);
    });
    return () => subscription.remove();
  }, [onAnswer]);
}
