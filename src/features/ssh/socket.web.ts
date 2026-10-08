import type { OpenSocket } from './socket';

/** Browsers can't open raw TCP connections, so SSH runs only in the Android and iOS apps. */
export const openSocket: OpenSocket = () =>
  Promise.reject(
    new Error("SSH needs the Android or iOS app: browsers can't open SSH connections.")
  );
