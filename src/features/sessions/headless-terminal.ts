import type * as XtermHeadless from '@xterm/headless';

type NavigatorFields = { userAgent?: unknown; platform?: unknown };

/**
 * Loads @xterm/headless so it also works on Android and iOS. When it loads, it reads
 * `navigator.userAgent` and `navigator.platform` unless `process.title` says it's in Node.
 * React Native has neither (its navigator is `{ product: 'ReactNative' }`), so the read
 * throws and the app closes on launch. Empty strings match no platform. They exist only
 * while xterm loads, so other libraries don't take React Native for a browser.
 */
function load(): typeof XtermHeadless {
  const navigator = (globalThis as { navigator?: NavigatorFields }).navigator;
  const added = navigator
    ? (['userAgent', 'platform'] as const).filter((key) => typeof navigator[key] !== 'string')
    : [];
  for (const key of added) navigator![key] = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must run after the fields are set
    return require('@xterm/headless');
  } finally {
    for (const key of added) delete navigator![key];
  }
}

export const { Terminal } = load();
export type HeadlessTerminal = XtermHeadless.Terminal;
