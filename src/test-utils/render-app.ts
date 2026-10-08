import { renderRouter } from 'expo-router/testing-library';

/**
 * Renders the real route tree in src/app at `initialUrl` and returns a router handle
 * for the expo-router matchers: `expect(app).toHavePathname('/settings')`.
 *
 * Use this instead of calling renderRouter directly. In SDK 57, renderRouter attaches
 * getPathname() and friends to the promise RNTL v14's async render returns, so
 * `expect(screen).toHavePathname()` throws. It also resolves fixture paths from the
 * working directory, not the test file.
 */
export async function renderApp(initialUrl = '/') {
  const handle = renderRouter('./src/app', { initialUrl });
  await handle;
  // Copy the helper methods off the promise; returning it would just unwrap it again.
  return { ...handle };
}
