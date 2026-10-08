# Rapid App Toolkit

A production-ready starting point for Android + iOS (+ web) apps, built to be developed by
coding agents. One TypeScript codebase on [Expo](https://expo.dev) SDK 57, with a single
command that tells an agent whether its change works, without a phone, emulator or Mac.

**What's included**

- Expo Router with typed routes, tabs, sign-in, not-found and error screens
- Supabase email/password auth with protected routes; the session survives restarts
- Light/dark theme and `Screen`, `Button`, `TextField` primitives
- `npm run check`: typecheck, lint, format, Jest, and Playwright against the real web build
- Dev / preview / production variants that install side by side
- EAS build, submit and over-the-air update config, plus Maestro device tests on EAS
- GitHub Actions CI and a Claude Code session hook that installs dependencies
- `AGENTS.md` / `CLAUDE.md` with the conventions and version traps agents need

## Quick start

```bash
npm install
npm run check      # should pass on a fresh clone
npm start          # press w for web; scan the QR code with a development build on a phone
```

Without Supabase configured, the app runs and shows a "Backend not configured" notice on
the sign-in screen. Copy `.env.example` to `.env.local` and fill it in to enable sign-in.

## Start a new app from this template

1. Create a repo from this one. Either enable **Settings → Template repository** on GitHub
   and use **Use this template**, or clone it and push to a new remote.
2. Give it an identity:
   ```bash
   npm run rename -- --name "Acme Notes" --id com.acme.notes
   npm run check
   ```
3. Hand it to your agent with what to build. `AGENTS.md` tells it how to work in the repo.

## Commands

| Command                               |                                                                |
| ------------------------------------- | -------------------------------------------------------------- |
| `npm run check`                       | Full verification (≈30s); `check:fast` skips the browser tests |
| `npm start`                           | Dev server                                                     |
| `npm test` / `npm run test:e2e`       | Jest / Playwright                                              |
| `npm run lint:fix` / `npm run format` | Auto-fix lint and formatting                                   |
| `npm run db:types`                    | Regenerate database types from your linked Supabase project    |
| `npm run doctor`                      | Check dependencies and config with `expo-doctor`               |
| `npm run rename -- --name … --id …`   | Set app name, slug, scheme and bundle IDs                      |

## Going to production

One-time setup per app. The accounts and store records need a person; everything after is
scripted.

1. **Accounts**: [Expo](https://expo.dev/signup) (free tier works),
   [Apple Developer Program](https://developer.apple.com/programs/) ($99/year), and a
   [Google Play Console](https://play.google.com/console) developer account (one-time fee).
2. **EAS project**:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init                # creates the project, sets extra.eas.projectId
   npx eas-cli@latest update:configure    # enables over-the-air updates
   ```
   Because `app.config.ts` exists, these may print values to add to `app.json` instead of
   writing them. Paste them into the `expo` object.
3. **Backend**: `npx eas-cli@latest integrations:supabase:connect` creates or links a
   Supabase project and writes the URL and publishable key to `.env.local` and to EAS
   environments. Create your tables with row level security, then run `npx supabase link`
   and `npm run db:types`.
4. **First builds**: `npx eas-cli@latest build --profile preview --platform all` produces
   installable builds for testers. EAS manages signing credentials when it asks.
5. **Stores**: create the app in App Store Connect and Play Console. Google Play requires the
   first upload of a new app to be done by hand in the console; after that, submissions are
   automatic. Fill in the privacy and data-safety forms.
6. **Ship**: `npx eas-cli@latest workflow:run .eas/workflows/deploy-production.yml` builds and
   submits when native code changed, or publishes an over-the-air update when it didn't.
   Uncomment `on:` in that file to deploy on every push to `master` (or your default branch).

Device tests: `npx eas-cli@latest workflow:run .eas/workflows/e2e.yml` builds the app and runs
the `.maestro` flows on an Android emulator and an iOS simulator.

## Not included yet

Add these per app as needed:

- Crash reporting and analytics (for example Sentry)
- Push notifications (`expo-notifications`, needs APNs and FCM credentials)
- Payments and subscriptions
- Social sign-in. If you add Google or other third-party sign-in on iOS, check App Store
  Review Guideline 4.8 (login services).
- Localisation

## Limits

- The web checks prove logic, navigation and layout, not native behaviour. Camera, push,
  permissions, gestures and the on-screen keyboard need a device run (Maestro on EAS or a
  person with a phone).
- iOS builds and store submission need the paid Apple account; EAS supplies the Macs.
