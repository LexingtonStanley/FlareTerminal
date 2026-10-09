/**
 * Android and iOS run the app on Hermes with React Native's globals, which are thinner than
 * Node's or a browser's: `process` is only `{ env }` and `navigator` only
 * `{ product: 'ReactNative' }`. Jest runs on Node, so a library that sniffs its environment
 * when it loads (xterm.js does) can pass every other test and still close the app on launch.
 * The app loads every route and module at startup, so this loads them all with React
 * Native's globals, then runs a session.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { SessionManager as SessionManagerType } from '@/features/sessions/session-manager';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/lib/secrets', () => jest.requireActual('@/test-utils/memory-storage'));
// Jest has no native side for the TCP socket module to bind to.
jest.mock('react-native-tcp-socket', () => ({ createConnection: jest.fn() }));
// The terminal view runs in a WebView (a browser) on Android and iOS, not on Hermes.
jest.mock('@/features/terminal/terminal-view', () =>
  jest.requireActual('@/test-utils/fake-terminal-view')
);

const APP = join(__dirname, '../src/app');
const routes = readdirSync(APP, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => `@/app/${relative(APP, join(APP, file)).replace(/\.tsx$/, '')}`);

function withReactNativeGlobals(load: () => void) {
  const title = Object.getOwnPropertyDescriptor(process, 'title');
  const navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  // Jest gives each test file its own copy of `process`, so this can't leak.
  delete (process as { title?: string }).title;
  Object.defineProperty(globalThis, 'navigator', {
    value: { product: 'ReactNative' },
    configurable: true,
    writable: true,
  });
  try {
    jest.isolateModules(load);
  } finally {
    if (title) Object.defineProperty(process, 'title', title);
    if (navigator) Object.defineProperty(globalThis, 'navigator', navigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
}

// Compiling every route takes a few seconds when Jest's cache is cold, as it is in CI.
const LOAD_TIMEOUT_MS = 30_000;

it(
  'loads the app and runs a session with React Native’s globals',
  async () => {
    let manager: SessionManagerType | undefined;
    withReactNativeGlobals(() => {
      /* eslint-disable @typescript-eslint/no-require-imports -- they must load with the globals */
      for (const route of routes) require(route);
      const { SessionManager } = require('@/features/sessions/session-manager');
      /* eslint-enable @typescript-eslint/no-require-imports */
      manager = new SessionManager({ openTransport: () => null, onAttention() {} });
      // Nothing the app loaded left browser-only fields behind.
      expect(globalThis.navigator).toEqual({ product: 'ReactNative' });
    });

    expect(routes).toEqual(expect.arrayContaining(['@/app/_layout', '@/app/session/[id]']));

    const id = manager!.start({ connectionId: 'box', name: 'Box', command: null });
    const screen = manager!.screen(id)!;
    await new Promise<void>((resolve) => screen.write('\x1b[1mhello\x1b[0m', resolve));
    expect(screen.buffer.active.getLine(0)?.translateToString(true)).toBe('hello');
  },
  LOAD_TIMEOUT_MS
);
