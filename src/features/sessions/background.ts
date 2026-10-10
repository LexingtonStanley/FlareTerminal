import type { LiveStatus } from './live-status';

/**
 * Keeps the app running while sessions are open and it isn't on screen, showing the live
 * status. On Android that's a foreground service (background.android.ts). iOS has no
 * equivalent for a terminal: it suspends the app soon after it leaves the screen, and
 * sessions reconnect when it returns. The web needs nothing.
 */
export function keepSessionsAlive(_status: LiveStatus | null): void {}
