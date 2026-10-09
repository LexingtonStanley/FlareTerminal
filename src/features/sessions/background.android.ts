import BackgroundService from 'react-native-background-actions';

/**
 * Android: while sessions are open, a foreground service (the ongoing "sessions connected"
 * notification) keeps the app running when it isn't on screen. Without it Android freezes
 * the app soon after it leaves the screen, which stalls its connections and, with them,
 * agent alerts. The service runs a headless JS task, which also keeps JS timers (keepalives,
 * the terminal's parser) running. plugins/with-background-sessions.js declares it.
 */

const OPTIONS = {
  taskName: 'FlareSessions',
  taskTitle: 'Flare Terminal',
  // Drawn from assets/images/android-icon-monochrome.png by the expo-notifications plugin.
  taskIcon: { name: 'notification_icon', type: 'drawable' },
  foregroundServiceType: ['specialUse' as const],
};

function describe(live: number) {
  return live === 1 ? '1 session connected' : `${live} sessions connected`;
}

let queue = Promise.resolve();

/** Starts, updates or stops the service for this many live sessions. Calls run in order. */
export function keepSessionsAlive(live: number): void {
  queue = queue.then(() => apply(live)).catch(() => {});
}

async function apply(live: number) {
  if (live === 0) {
    if (BackgroundService.isRunning()) await BackgroundService.stop();
  } else if (BackgroundService.isRunning()) {
    await BackgroundService.updateNotification({ taskDesc: describe(live) });
  } else {
    // The task runs until stop(); the service exists for as long as it does.
    await BackgroundService.start(() => new Promise<void>(() => {}), {
      ...OPTIONS,
      taskDesc: describe(live),
    });
  }
}
