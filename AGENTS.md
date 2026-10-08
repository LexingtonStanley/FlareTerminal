# AGENTS.md

Expo SDK 57 app template (React Native 0.86, React 19.2, TypeScript 6, Expo Router) that ships
to Android, iOS and the web from one codebase. It is set up so a coding agent can verify every
change without a phone, emulator or Mac.

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
- **Supabase** now uses a _publishable key_ (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) and
  stores sessions with `expo-sqlite/localStorage`, not AsyncStorage.
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
| `npm run db:types`                            | Regenerate `src/lib/database.types.ts` from the linked Supabase project             |
| `npm run rename -- --name "X" --id com.x.app` | Give a new app its own name and IDs                                                 |

## Layout

```
src/app/                 Routes only. Every file here is a screen; never put tests or helpers here.
  _layout.tsx            Providers, splash, Stack.Protected auth guards, root ErrorBoundary
  sign-in.tsx            Reachable only when signed out
  (app)/                 Signed-in area: tab navigator (_layout.tsx), index, settings
  +not-found.tsx
src/components/ui/       Screen, Button, TextField primitives: build screens from these
src/components/          ThemedText, ThemedView, ExternalLink
src/features/<name>/     Feature logic and its colocated *.test.ts(x)
src/lib/                 env.ts, supabase.ts (getSupabase), database.types.ts
src/test-utils/          Jest helpers: renderApp, createFakeSupabase
__tests__/               Router-level Jest tests (render the real src/app tree)
e2e/web/                 Playwright specs; fake-supabase.ts answers backend requests in the browser
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
- **Auth**: `useAuth()` from `src/features/auth/auth-provider.tsx`. Signed-in screens go under
  `src/app/(app)/`. Protected routes are a client-side convenience; row level security protects
  the data. For an app without accounts, remove the guards in `src/app/_layout.tsx`, plus
  `sign-in.tsx` and `src/features/auth`.
- **Data**: query Supabase through `getSupabase()`, which returns `null` when unconfigured.
  Enable row level security on every table. After a schema change, run `npm run db:types` so
  queries are type-checked.
- **Config and secrets**: local values go in `.env.local` (see `.env.example`); cloud builds
  use `eas env:set`. `EXPO_PUBLIC_*` values ship inside the app, so never put a secret key there.
- **Tests**: a behaviour change comes with a test.
  - Logic and components: colocated `*.test.ts(x)`; query by role, label or text.
  - Flows across screens: `__tests__/`, using `renderApp('/path')` and
    `jest.mocked(getSupabase).mockReturnValue(createFakeSupabase())`.
  - Web E2E: `e2e/web/*.spec.ts`. The test build points at a fake Supabase URL. When the app
    calls new endpoints (for example `/rest/v1/<table>`), add handlers to `fake-supabase.ts`.
  - `testID` is only for Maestro flows (`.maestro/`).
- **Limits of the web check**: it can't catch native-only behaviour (camera, push,
  permissions, gestures, the keyboard). Cover those with a Maestro flow and say in your summary
  that they need a device run.

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
