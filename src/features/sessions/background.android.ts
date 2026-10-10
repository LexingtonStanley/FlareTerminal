import * as Linking from 'expo-linking';
import BackgroundService from 'react-native-background-actions';

import type { LiveStatus } from './live-status';

/**
 * Android: while sessions are open, a foreground service keeps the app running when it isn't
 * on screen. Without it Android freezes the app soon after it leaves the screen, which stalls
 * its connections and, with them, agent alerts. The service runs a headless JS task, which
 * also keeps JS timers (keepalives, the terminal's parser) running.
 * plugins/with-background-sessions.js declares it.
 *
 * Its ongoing notification is the live status (live-status.ts): which agents need you, are
 * working or finished. A tap opens the inbox.
 */

const OPTIONS = {
  taskName: 'FlareSessions',
  // Android names the notification's channel after the title and description the service
  // starts with, so they stay fixed; the status follows at once as an update.
  taskTitle: 'Flare Terminal',
  taskDesc: 'Keeps your sessions connected',
  // Drawn from assets/images/android-icon-monochrome.png by the expo-notifications plugin.
  taskIcon: { name: 'notification_icon', type: 'drawable' },
  foregroundServiceType: ['specialUse' as const],
};

let queue = Promise.resolve();
/** What the notification says now, so an unchanged status isn't posted again. */
let shown: LiveStatus | null = null;

/** Starts, updates or stops the service for this status (null: no session open). In order. */
export function keepSessionsAlive(status: LiveStatus | null): void {
  queue = queue.then(() => apply(status)).catch(() => {});
}

async function apply(status: LiveStatus | null) {
  if (!status) {
    shown = null;
    if (BackgroundService.isRunning()) await BackgroundService.stop();
    return;
  }
  if (!BackgroundService.isRunning()) {
    shown = null;
    // The task runs until stop(); the service exists for as long as it does.
    await BackgroundService.start(() => new Promise<void>(() => {}), {
      ...OPTIONS,
      linkingURI: Linking.createURL('/inbox'),
    });
  }
  if (shown?.title === status.title && shown.text === status.text) return;
  await BackgroundService.updateNotification({ taskTitle: status.title, taskDesc: status.text });
  shown = status;
}
