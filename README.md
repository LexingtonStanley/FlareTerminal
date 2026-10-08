# Flare Terminal

A terminal for your phone, built for working with AI coding agents (Claude Code and friends)
on a computer you're away from. One TypeScript codebase on [Expo](https://expo.dev) SDK 57 for
Android, iOS and the web, started from the RapidAppToolkit template.

**Status: step 1, a working terminal.** It connects to [ttyd](https://github.com/tsl0922/ttyd)
on your computer over WebSocket and gives you a real terminal (colours, full-screen apps,
resize, Unicode) with the keys a phone keyboard lacks.

- [xterm.js](https://xtermjs.org) rendering, in a WebView on Android/iOS and as plain DOM on
  the web (an Expo DOM component)
- Saved connections; passwords live in the iOS Keychain / Android Keystore
- Key bar: Esc, Tab, Shift+Tab, sticky Ctrl and Alt, arrows, Home/End, PgUp/PgDn, `| ~ / -`
- Composer: a native text field for typing or dictating a command or an agent prompt, sent as
  a bracketed paste then Enter (Android keyboards don't type reliably into xterm.js directly)
- Status, the window title the shell or agent sets, reconnect, adjustable font size
- Light and dark mode

## Connect to your computer

On the computer, install ttyd and tmux (`brew install ttyd tmux`, `apt install ttyd tmux`, …),
then run:

```bash
ttyd -W -c you:a-long-password tmux new -A -s main
```

- `-W` lets you type (ttyd is read-only without it).
- `-c user:password` requires a login. Enter the same username and password in the app.
- `tmux new -A -s main` attaches to one lasting session, so shells and agents keep running when
  the phone sleeps or loses signal, and you reconnect to exactly where you were.
- Run it with a UTF-8 locale (`LANG=en_US.UTF-8`), or tmux shows `_` for non-ASCII characters.

Then in the app: **New connection**, give it a name and the address, e.g. `192.168.1.20:7681`.

**Keep it off the open internet.** ttyd hands out a shell. Good options:

- [Tailscale](https://tailscale.com) on the computer and the phone, then connect to
  `http://<computer>:7681`; the traffic is WireGuard-encrypted. Better still, bind ttyd to
  localhost (`-i lo`, `lo0` on macOS) and run `tailscale serve --bg 7681`, then connect to
  `https://<computer>.<tailnet>.ts.net`.
- ttyd's own TLS (`--ssl --ssl-cert … --ssl-key …`) or a reverse proxy with HTTPS.

The app warns when an address would send the session unencrypted over the internet.

The web build can't send ttyd's username and password, because browsers can't set headers on
a WebSocket. It works with hosts that have no `-c` (for example behind a sign-in proxy). Use
the Android or iOS app for `-c`.

## Develop

```bash
npm install
npm run check      # typecheck, lint, format, Jest, Playwright on the web build
npm start          # press w for web; native needs a development build
```

`AGENTS.md` has the conventions and the traps this stack has already hit. Native libraries
(the DOM WebView, SecureStore) need a development build on a device:
`npx eas-cli@latest build --profile development`.

## How it works

```
 phone                                                       computer
┌──────────────────────────────────────────────┐            ┌─────────────────┐
│ TerminalView ('use dom' xterm.js)             │            │ ttyd -W -c …    │
│   ▲ write (batched per frame)  │ onInput      │            │   └ tmux        │
│ useTerminalSession: modifiers, key bar,       │  WebSocket │      └ shell,   │
│   composer, reconnect                         │◄──────────►│        agents   │
│ TerminalTransport ── TtydTransport            │  "tty"     └─────────────────┘
└──────────────────────────────────────────────┘
```

- `src/features/terminal/terminal-view.tsx` only renders. On native, Expo runs it in a WebView;
  output reaches it through an imperative handle and input comes back through callbacks.
- `src/features/terminal/transport.ts` is the seam between the view and a host.
  `ttyd.ts` implements ttyd's protocol, checked by hand against ttyd 1.7.7; the automated
  tests use a fake host that speaks the same protocol (`e2e/web/fake-ttyd.ts`). The
  connection lives in app code rather than in the WebView, because only React Native's
  WebSocket can send ttyd's `Authorization` header, and a native SSH transport will plug in
  the same way.

## Open source used

| Project                                                                                      | Licence | Used for                                      |
| -------------------------------------------------------------------------------------------- | ------- | --------------------------------------------- |
| [xterm.js](https://github.com/xtermjs/xterm.js) and its fit, Unicode 11 and web-links addons | MIT     | Terminal rendering and input                  |
| [Expo](https://github.com/expo/expo) (DOM components, `@expo/dom-webview`)                   | MIT     | App, WebView host                             |
| [ttyd](https://github.com/tsl0922/ttyd)                                                      | MIT     | Runs on your computer; not shipped in the app |

Projects that were evaluated and not used: Whip (an Expo, xterm.js and SSH terminal, but
AGPL), `@fressh/react-native-terminal` (MIT; a native SSH and terminal renderer, no web),
ghostty-web and wterm (renderers to revisit as they mature).

## Roadmap

1. **SSH** as a second transport on Android/iOS, so any machine with `sshd` works without ttyd
   (russh-based native module; host-key verification and key-based login from the start).
2. **Agent features**: one-tap prompts and commands, notifications when an agent is waiting for
   input, image and file hand-off, multiple sessions.
3. Touch selection and scrolling improvements, pinch to zoom, and a WebGL renderer.

## Limits

- The web checks prove logic, layout and the protocol. On-device behaviour (the WebView, the
  soft keyboard and IMEs, Keychain/Keystore, cleartext `ws://` on Android) needs a device run:
  `.maestro/terminal.yaml` covers the basics on EAS
  (`npx eas-cli@latest workflow:run .eas/workflows/e2e.yml`).
- Typing straight into the terminal on Android may wait for Enter with some keyboards
  (xterm.js issue #5108); use the composer there.

## Commands

| Command                               |                                                                |
| ------------------------------------- | -------------------------------------------------------------- |
| `npm run check`                       | Full verification (≈60s); `check:fast` skips the browser tests |
| `npm start`                           | Dev server                                                     |
| `npm test` / `npm run test:e2e`       | Jest / Playwright                                              |
| `npm run lint:fix` / `npm run format` | Auto-fix lint and formatting                                   |
| `npm run doctor`                      | Check dependencies and config with `expo-doctor`               |

## Going to production

One-time setup. The accounts and store records need a person; everything after is scripted.

1. **Accounts**: [Expo](https://expo.dev/signup), the
   [Apple Developer Program](https://developer.apple.com/programs/) and a
   [Google Play Console](https://play.google.com/console) developer account.
2. **EAS project**: `npx eas-cli@latest login`, `npx eas-cli@latest init`, then
   `npx eas-cli@latest update:configure`. Because `app.config.ts` exists, these may print
   values to add to `app.json` instead of writing them.
3. **First builds**: `npx eas-cli@latest build --profile preview --platform all`.
4. **Stores**: create the app in App Store Connect and Play Console (Google Play needs the
   first upload by hand), and fill in the privacy and data-safety forms.
5. **Ship**: `npx eas-cli@latest workflow:run .eas/workflows/deploy-production.yml`.

The bundle ID is `com.lexingtonstanley.flareterminal`; change it with
`npm run rename -- --name "Flare Terminal" --id <your.id>` before the first store build.
