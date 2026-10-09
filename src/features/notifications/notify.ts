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

export function postAgentNotification(sessionId: string, title: string, body: string) {
  configure();
  void Notifications.scheduleNotificationAsync({
    content: { title, body, data: { sessionId } },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

/** Calls `onOpen` with the session id when the person taps one of our notifications. */
export function useNotificationOpens(onOpen: (sessionId: string) => void) {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const sessionId = response.notification.request.content.data?.sessionId;
      if (typeof sessionId === 'string') onOpen(sessionId);
    });
    return () => subscription.remove();
  }, [onOpen]);
}
