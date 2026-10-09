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
  streaming data in through the imperative handle (`useDOMImperativeHandle`), never through
  changing props, and batch it: each call is an `injectJavaScript`. Settings that rarely change
  (theme, font size) are props. Its methods aren't callable until
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
  ref and pass it in (see `useSessionView`).
- **`@xterm/headless` 6.0.0** names a missing file in its `"module"` field, which web builds
  read first; `metro.config.js` resolves it to `lib-headless/xterm-headless.js`.
- **The in-app keyboard's keys have no `onPress`**: one touch surface tracks every finger. In
  Jest, act on a key by name with
  `fireEvent(key, 'accessibilityAction', { nativeEvent: { actionName } })` (`'activate'` taps;
  `'up'`, `'down'`, `'left'`, `'right'` flick). In Playwright, click it, or drive the mouse for
  flicks (`e2e/web/keyboard.spec.ts`). Modifier keys are `role="switch"`.
- **noble** (`@noble/*`) ships ES modules only; `jest.config.js` transforms it.
- **Coding agents' git worktrees** (`.claude/worktrees/`) hold a second copy of the app; Jest,
  Metro, ESLint, Prettier and `tsc` all ignore them. Keep it that way.
- **React Native's globals are thinner than Jest's.** Jest runs on Node, but on Android and iOS
  `process` is only `{ env }` and `navigator` only `{ product: 'ReactNative' }`. A library that
  sniffs its environment when it loads can pass every test and still close the app on launch
  (xterm.js did: `headless-terminal.ts` works around it). Every module loads at startup, so
  `__tests__/native-globals.test.ts` loads every route with React Native's globals; a new
  native-only library may need a stub there.
- **Over-the-air updates match builds by fingerprint** (`runtimeVersion.policy: fingerprint`):
  the native project (from `node_modules`), app config and `package.json` scripts. Publish
  preview updates with `APP_VARIANT=preview` (`npm run update:preview`) or they never reach
  preview builds, and check `APP_VARIANT=preview npx expo-updates runtimeversion:resolve
--platform android` before and after a change you mean to ship over the air. A build from a
  machine whose `node_modules` is stale fails EAS's "Configure expo-updates" phase (runtime
  version mismatch): `npm install` first, as `npm run build:preview` does.
- **The keyboard covers inputs on Android**: apps draw edge-to-edge, so the window no longer
  shrinks for the keyboard, and React Native's `KeyboardAvoidingView` (with Expo's suggested
  `behavior={undefined}` on Android) does nothing. Forms use `<Screen scroll>`, which is a
  `KeyboardAwareScrollView` from react-native-keyboard-controller (it keeps the focused field
  in view); fixed layouts use that library's `KeyboardAvoidingView` with `behavior="padding"`.
  Every nested ScrollView needs `keyboardShouldPersistTaps="handled"` too, or the first tap
  with the keyboard open only closes it.
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
| `npm run build:preview`                       | `npm install`, then an Android preview build on EAS                                 |
| `npm run update:preview -- --message "…"`     | Over-the-air update for preview builds (sets `APP_VARIANT=preview`)                 |
| `npm run rename -- --name "X" --id com.x.app` | Give a new app its own name and IDs                                                 |

## Layout

```
src/app/                 Routes only. Every file here is a screen; never put tests or helpers here.
  _layout.tsx            Providers (preferences, connections, shortcuts, sessions), stack,
                         attention banner, root ErrorBoundary
  (tabs)/                Tab navigator: index (Home: sessions, shortcuts, connections), settings
  connections/           new.tsx, [id].tsx (edit): the connection form
  shortcuts/             new.tsx, [id].tsx (edit): the shortcut form
  session/[id].tsx       A session: session strip, view, coding keyboard (or, for writing,
                         the key bar and composer with the phone's keyboard)
  keyboard-preview.tsx   Both keyboards against a pretend shell, no host needed
  +not-found.tsx
src/components/ui/       Screen, Button, TextField primitives: build screens from these
src/components/          ThemedText, ThemedView, ExternalLink
src/features/terminal/   terminal-view ('use dom' xterm.js), transport.ts (interface), ttyd.ts,
                         ssh-transport.ts, open-transport.ts, keys.ts (bytes for keys), composer,
                         cursor-tap.ts (a tap on the edited line as arrow keys)
src/features/ssh/        SSH-2 client (client.ts), packets and ciphers, host and user keys,
                         known hosts, the app's key, socket.ts (TCP; socket.web.ts refuses)
src/features/sessions/   SessionManager (every open session, headless xterm), alerts, provider,
                         useSessionView, session strip, status, attention banner
src/features/keyboard/   Accessory bar and coding keyboard: layout, gestures, touch tracking,
                         modifiers, haptics (docs/keyboard.md explains the design)
src/features/shortcuts/  Shortcut type and groups, agent-command.ts (the command for an agent:
                         Claude Code/Codex/Hermes/pi in tmux/zellij), shell quoting, provider,
                         form, Home tile
src/features/notifications/ Local notifications for agent alerts (no-op on web)
src/features/connections/ Connection type (SSH or ttyd), validation, ConnectionsProvider, form
src/features/settings/   PreferencesProvider (font size)
src/features/<name>/     Feature logic and its colocated *.test.ts(x)
src/lib/                 storage.ts (JSON in localStorage / SQLite), secrets.ts (Keychain/Keystore)
src/test-utils/          Jest helpers: renderApp, memory-storage, fake-terminal-view, fake-transport,
                         fake-notify, ssh-server (a real SSH server from ssh2)
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
- **Design**: `docs/design.md` has the direction and the tokens (colour, type, space) and when
  to use each. One ember accent per screen; Geist Mono only for what a computer reads. Fonts
  are per-weight families, so style text with `sans(600)` / `mono()`, never `fontWeight`.
- **Navigation**: routes are typed, so a bad `href` or `router.push()` fails typecheck.
- **No accounts**: the hosts a person connects to do the authentication. The template's
  Supabase auth was removed; RapidAppToolkit has it if a backend (for example syncing
  connections) is ever needed.
- **Terminal architecture**: the view only renders; a `TerminalTransport` only moves bytes;
  `SessionManager` owns sessions, which outlive their screens (each keeps a headless xterm for
  replay and alerts); `useSessionView` joins a view to a session (attach after `onReady`, batch
  output per frame, modifiers). A new way to reach a host (mosh, a relay) is a new transport
  behind the same interface, chosen in `open-transport.ts`. Keep byte-level logic pure and
  unit-tested (`keys.ts`, the ttyd framing, the SSH packets).
- **Background**: a transport marks a closed status `retry` when the network failed (not when
  the session ended or was refused); `SessionManager` then reconnects on a backoff, and again
  when the app returns to the screen. On Android, `sessions/background.android.ts` runs a
  foreground service (react-native-background-actions, declared as `specialUse` by
  `plugins/with-background-sessions.js`) while sessions are live; `background.ts` is the
  no-op for iOS and the web.
- **SSH is security code.** Never weaken host-key checking (a changed key refuses to connect),
  add algorithms without a reason, or log secrets. `client.test.ts` runs against a real SSH
  server (`ssh2`); a change to the protocol also gets a manual run against OpenSSH.
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
    `fakeTtyd(page)` playing the host. Extend its shell when a test needs more commands. SSH
    can't run in a browser; its end-to-end tests are in Jest.
  - `testID` is only for Maestro flows (`.maestro/`).
- **Limits of the web check**: it can't catch native-only behaviour (the WebView hosting the
  terminal, TCP sockets, soft keyboards and IMEs, `inputmode="none"`, Keychain/Keystore,
  cleartext networking, notifications, the foreground service, haptics, multi-touch). Cover
  those with a Maestro flow and say in your summary that they need a device run.
- **Checking against a real ttyd**: download a release binary from
  https://github.com/tsl0922/ttyd/releases, run `ttyd -W -i lo -p 7690 bash`, serve the web
  build (`npm run web:build && node scripts/serve-web.mjs`) and connect to `localhost:7690`.
- **Checking against a real OpenSSH**: run `/usr/sbin/sshd -D -p 2222 -f <config>` with its own
  host key, then point a temporary Jest test at it with `openNodeSocket` from
  `src/test-utils/ssh-server.ts` (the client takes any socket). Remove the test afterwards.

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
