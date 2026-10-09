import type { Listen } from './forward';

/** Browsers can't listen on ports; previews need the Android or iOS app. */
export const listenLocal: Listen = () =>
  Promise.reject(new Error('Previews need the Android or iOS app'));
