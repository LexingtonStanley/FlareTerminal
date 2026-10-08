# AGENTS.md

Flare Terminal: a mobile terminal for working with AI coding agents on a remote computer. Expo
SDK 57 (React Native 0.86, React 19.2, TypeScript 6, Expo Router), shipping to Android, iOS and
the web from one codebase, started from the RapidAppToolkit template. It is set up so a coding
agent can verify every change without a phone, emulator or Mac. README.md explains the product
and the architecture.

## Definition of done

```bash
npm run check   # typecheck + lint + format + Jest + Playwright on the web build (~30s)
```

A task is done when `npm run check` passes. `npm run check:fast` skips the browser tests while
iterating. Fix lint and formatting with `npm run lint:fix` and `npm run format`. Never skip,
disable or delete a test to get green. Fix the code or the test.

For UI changes, look at the result as well: Playwright saves screenshots of failures in
`test-results/`, and a spec can call `page.screenshot()`. Check both light and dark mode.

## Your training data is out of date

Expo ships breaking changes every SDK release. Before writing code that touches Expo, EAS,
React Native or a library API:

1. Check the installed version in `package.json`.
2. Read the versioned docs: `https://docs.expo.dev/versions/v57.0.0/`. Any Expo docs page is
   available as Markdown by appending `.md`. The index is https://docs.expo.dev/llms.txt.
3. Prefer docs shipped inside `node_modules` when a package has them.

Traps already hit in this exact stack:

- **React Native Testing Library v14**: `render`, `fireEvent`, `act` and `renderHook` are
  async. Always `await` them, and prefer `userEvent`. Before writing tests, read
  `node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md`.
- **`test-renderer` must match React's minor version** (React 19.2 → `test-renderer@~1.2`). A
  mismatch renders empty trees. Upgrade them together.
- **Router tests**: use `renderApp()` from `src/test-utils/render-app.ts`, not `renderRouter`
  directly. In SDK 57, `renderRouter` attaches `getPathname()` to a promise, so
  `expect(screen).toHavePathname()` throws, and it resolves fixture paths from the working
  directory, not the test file.
- **`npx expo install` doesn't edit `app.json`** because `app.config.ts` exists. It prints the
  plugin entry instead, and you add it to `plugins` in `app.json` yourself. `--save-dev` is not
  always honoured either, so check where the package landed.
- **DOM components** (`'use dom'`, `src/features/terminal/terminal-view.tsx`): on native they run
  in a WebView (`@expo/dom-webview`), so props must be JSON-serializable, function props become
  async calls back to the app, and the component can't share React state with the app. Push
  data in through the imperative handle (`useDOMImperativeHandle`), never through changing
  props, and batch it: each call is an `injectJavaScript`. Its methods aren't callable until
  the view has called `onReady`. Expo types handle methods as `(...args: JSONValue[])`; the view
  wraps that once (`useTypedDOMImperativeHandle`) so callers keep precise types.
- **ttyd** ignores input unless started with `-W`, needs the `Authorization: Basic` header on
  the WebSocket upgrade when started with `-c` (browsers can't send it, React Native can), and
  closes with 1006 when the process exits non-zero. Protocol notes are at the top of
  `src/features/terminal/ttyd.ts`.
- **xterm.js 6** paints its viewport black under the themed layer; `terminal-view.css` hides
  the seam this leaves in light mode. Click `.xterm-screen` in Playwright to focus the terminal
  (`.xterm-rows` never counts as stable).
- **React Compiler lint (`react-hooks/refs`)** treats any object that contains a ref as a ref,
  so returning a ref from a hook taints everything else it returns. Let the component own the
  ref and pass it in (see `useTerminalSession`).
- **Hermes** has `TextEncoder`, and Expo installs a streaming `TextDecoder`, `URL` and
  `URLSearchParams` on native, so use the standard APIs.
- **`EXPO_PUBLIC_*`** variables are only inlined when written exactly as
  `process.env.EXPO_PUBLIC_NAME`: no destructuring, no `process.env[name]`.
- **Accessibility props**: use `role` and `aria-label`. `accessibilityRole` and
  `accessibilityLabel` are deprecated on web.

## Commands

| Command                                       | What it does                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run check` / `check:fast`                | Everything / everything except Playwright                                           |
| `npm run typecheck`                           | Regenerates typed-route types (`scripts/gen-types.mjs`), then `tsc`                 |
| `npm test` / `npm run test:e2e`               | Jest / Playwright against a production web build                                    |
| `npm start`                                   | Dev server (`w` opens web; native needs a development build)                        |
| `npx expo install <pkg>`                      | Add a dependency at the SDK-compatible version. Never use plain `npm install <pkg>` |
| `npm run doctor`                              | `expo-doctor`: dependency and config problems                                       |
| `npm run rename -- --name "X" --id com.x.app` | Give a new app its own name and IDs                                                 |

## Layout

```
src/app/                 Routes only. Every file here is a screen; never put tests or helpers here.
  _layout.tsx            Providers (preferences, connections), stack, root ErrorBoundary
  (tabs)/                Tab navigator: index (connections list), settings
  connections/           new.tsx, [id].tsx (edit): the connection form
  terminal/[id].tsx      A terminal session: view, key bar, composer, status
  +not-found.tsx
src/components/ui/       Screen, Button, TextField primitives: build screens from these
src/components/          ThemedText, ThemedView, ExternalLink
src/features/terminal/   terminal-view ('use dom' xterm.js), transport.ts (interface), ttyd.ts,
                         open-transport.ts, use-terminal-session.ts, keys.ts, key-bar, composer
src/features/connections/ Connection type, validation, ConnectionsProvider, form
src/features/settings/   PreferencesProvider (font size)
src/features/<name>/     Feature logic and its colocated *.test.ts(x)
src/lib/                 storage.ts (JSON in localStorage / SQLite), secrets.ts (Keychain/Keystore)
src/test-utils/          Jest helpers: renderApp, memory-storage, fake-terminal-view, fake-transport
__tests__/               Router-level Jest tests (render the real src/app tree)
e2e/web/                 Playwright specs; fake-ttyd.ts plays a ttyd host via page.routeWebSocket
.maestro/                Device flows, run on EAS
.eas/workflows/          EAS cloud workflows (device E2E, production deploy)
app.json / app.config.ts Identity / build variants (APP_VARIANT = development | preview | production)
```

## Conventions

- **Native code**: `ios/` and `android/` are generated and git-ignored. Never create or edit
  them. Configure native behaviour with `app.json` and config plugins. A new native library
  needs a new development build (`eas build --profile development`) before it runs on a device.
- **Screens**: wrap content in `<Screen>`; use `ThemedText`, `ThemedView` and `useTheme()`
  colors, never hard-coded colors. Every screen must work in light and dark mode and at phone
  width on web.
- **Navigation**: routes are typed, so a bad `href` or `router.push()` fails typecheck.
- **No accounts**: the hosts a person connects to do the authentication. The template's
  Supabase auth was removed; RapidAppToolkit has it if a backend (for example syncing
  connections) is ever needed.
- **Terminal architecture**: the view only renders; a `TerminalTransport` only moves bytes;
  `useTerminalSession` joins them (connect after `onReady`, batch output per frame, sticky
  modifiers, reconnect). A new way to reach a host (SSH, a relay) is a new transport behind the
  same interface, chosen in `open-transport.ts`. Keep byte-level logic pure and unit-tested
  (`keys.ts`, the ttyd framing).
- **Terminal output is untrusted.** Only open `http(s)` links from it, never evaluate it, and
  don't enable xterm.js features that write to the clipboard or file system without a prompt.
- **Data on the device**: small JSON through `src/lib/storage.ts`; passwords and keys only
  through `src/lib/secrets.ts` (no-op on web, where `secretsSupported` is false).
- **Config and secrets**: local values go in `.env.local` (see `.env.example`); cloud builds
  use `eas env:set`. `EXPO_PUBLIC_*` values ship inside the app, so never put a secret key there.
- **Tests**: a behaviour change comes with a test.
  - Logic and components: colocated `*.test.ts(x)`; query by role, label or text.
  - Flows across screens: `__tests__/`, using `renderApp('/path')` with the in-memory storage,
    fake terminal view and fake transport from `src/test-utils/` (see the `jest.mock` lines at
    the top of `__tests__/terminal-flow.test.tsx`). Drive the host with `act(() => transport.…)`.
  - Web E2E: `e2e/web/*.spec.ts` against the real xterm.js and `TtydTransport`, with
    `fakeTtyd(page)` playing the host. Extend its shell when a test needs more commands.
  - `testID` is only for Maestro flows (`.maestro/`).
- **Limits of the web check**: it can't catch native-only behaviour (the WebView hosting the
  terminal, soft keyboards and IMEs, Keychain/Keystore, cleartext networking, gestures). Cover
  those with a Maestro flow and say in your summary that they need a device run.
- **Checking against a real ttyd**: download a release binary from
  https://github.com/tsl0922/ttyd/releases, run `ttyd -W -i lo -p 7690 bash`, serve the web
  build (`npm run web:build && node scripts/serve-web.mjs`) and connect to `localhost:7690`.

## Builds and releases

These need an Expo account, and the store accounts need a human. Agents prepare, people sign.

| Profile                                 | Use                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `development` / `development-simulator` | Dev client for devices / iOS simulator (`.dev` bundle ID)                         |
| `preview`                               | Internal testers, APK on Android (`.preview` bundle ID, `preview` update channel) |
| `production`                            | Store builds, build numbers auto-incremented remotely                             |
| `e2e-test`                              | Simulator/APK builds for the Maestro workflow                                     |

- Device E2E: `npx eas-cli@latest workflow:run .eas/workflows/e2e.yml`
- Release: `npx eas-cli@latest workflow:run .eas/workflows/deploy-production.yml`. If native
  code changed it builds and submits to the stores; otherwise it ships an over-the-air update.
- First-time setup for a new app is in README.md under "Going to production".
