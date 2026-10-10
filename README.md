# Flare Terminal

A terminal for your phone, built for working with AI coding agents (Claude Code and friends)
on a computer you're away from. Like Termius: type `lexde@lexbox`, sign in, and you have a
shell. One TypeScript codebase on [Expo](https://expo.dev) SDK 57 for Android and iOS (and a
web build), started from the RapidAppToolkit template.

- **SSH, with nothing to install on the computer.** If `ssh lexde@lexbox` works from your
  laptop, the app connects the same way: over Tailscale, your LAN, or anywhere sshd listens.
  Password or keyboard-interactive login, or a key the app makes and keeps in the Keychain /
  Keystore. Host keys are checked on every connect (trust on first use, with the fingerprint).
- **Sessions that keep running.** Open several at once and switch from the strip at the top
  of a session or from Home. Leaving a session doesn't close it, and coming back replays its
  screen exactly. On Android they stay connected while you use other apps, and a dropped
  connection reconnects by itself. Swipe to scroll back, with a fling; inside tmux (with
  mouse mode on, as agent shortcuts set it) and zellij a swipe scrolls their own history.
- **Reading mode.** Swipe back through an agent's output and a Reading mode button appears:
  the history as text that wraps to the phone, in the terminal's colours, with each tool
  call's output folded to its first lines, to select or copy all as Markdown. When the agent
  runs in tmux or zellij over SSH, it reads their whole history (the newest 10,000 lines), not
  just the screen, with one read-only `sh` script beside the session
  (`src/features/reading/capture.ts`); chips at the top switch to the host's other sessions.
- **Shortcuts.** One tap connects and runs a command. An agent shortcut takes a folder, a
  name, the agent (Claude Code, Codex, Hermes or pi), a tmux or zellij session and whether to
  skip permission prompts, and writes the command, which stays yours to edit. Any other
  command works too (presets for tmux, zellij, `git pull`, `df -h`, htop). Home shows them in
  groups such as Agents and Maintenance.
- **Agent alerts.** When an agent rings the bell or sends a terminal notification (OSC 9, 777
  or 99), the app flags the session, shows a banner on other screens, and posts a phone
  notification while the app is in the background.
- **Previews of what your agent is building.** When a dev server prints
  `http://localhost:5173`, tap the link (or the preview button) and the page opens in the app,
  forwarded through the session's SSH connection like `ssh -L`. Back, forward, reload and the
  address bar work as in a browser, and the port closes when you leave.
- **Host health.** A line above an SSH session shows the computer's load, memory, disk and
  uptime, refreshed every 10 seconds, with anything nearly full in red. Nothing to install:
  while the session is on screen, the app runs one small read-only `sh` script beside it
  (`src/features/health/health.ts`; Linux and macOS). Settings turns it off.
- **A coding keyboard** in place of the phone's: no autocorrect, every key reaches the
  terminal. Esc, Tab/Shift+Tab, sticky Ctrl and Alt, an arrows joystick, Home/End and the
  symbols phones bury, all fixed in place. Tap the line you're editing to move the cursor
  there. See [docs/keyboard.md](docs/keyboard.md).
- **Writing with the phone's keyboard**: the globe key opens a text field for prompts, with
  autocorrect, swiping and dictation, sent as a paste then Enter, and the coding keys above.
- [xterm.js](https://xtermjs.org) rendering (colours, full-screen apps, resize, Unicode,
  links) and adjustable font size.
- **Ten themes**, each in light and dark: Flare, Phosphor, Tokyo Night, Catppuccin, Gruvbox,
  Solarized, Graphite, Orbit, Neon and Concrete. A theme sets the app's colours, type and
  shape and the terminal's colours together; light or dark follows the phone or is set in
  Settings.

## Put it on your phone

The app needs a build of its own (SSH uses a native TCP socket, so Expo Go can't run it).
With a free [Expo](https://expo.dev/signup) account, from this folder on your laptop:

```bash
npx eas-cli@latest login
npm run build:preview   # npm install, then an APK built on EAS
```

EAS builds in the cloud and gives a link and QR code to install it. For an iPhone, Apple only
allows installs on registered devices with an
[Apple Developer](https://developer.apple.com/programs/) account: run
`npx eas-cli@latest device:create`, then the same build command with `--platform ios`.

For development, `--profile development` makes a development build that loads your code from
`npm start` instead.

**Updating it.** A change that touches only the app's code reaches installed preview builds over
the air in about a minute, without a new build:

```bash
npm run update:preview -- --message "What changed"
```

Then close and reopen the app (twice if needed). A build only accepts updates whose runtime
version (a fingerprint of the native project and app config) matches its own; the script sets
`APP_VARIANT=preview` so it does. New native libraries, plugins, app config or `package.json`
scripts change the fingerprint and need a new build.

**After pulling changes, run `npm install` before building or updating** (`build:preview` does
it for you). The fingerprint comes from your `node_modules`, and EAS stops a build ("Configure
expo-updates" fails with a runtime version mismatch) when it differs from the one EAS computes
after a clean install.

## Connect to your computer

1. **New connection**, then type it the way you would after `ssh`: `lexde@lexbox`
   (`user@host`, or `user@host:port`), and the password if it uses one.
2. **Open** it. The first time, the app shows the computer's host key fingerprint and asks
   you to trust it. If the key ever changes, it refuses to connect until you forget the old
   one (in the connection's settings).

With [Tailscale](https://tailscale.com) on the phone and the computer, use the computer's
Tailscale name (`lexbox`) or IP. Traffic is encrypted twice (SSH inside WireGuard) and sshd
needn't face the internet.

The computer needs an SSH server, which most already have:

- Linux: `sshd` (`sudo apt install openssh-server` if `ssh localhost` fails).
- macOS: System Settings → General → Sharing → Remote Login.
- Windows: Settings → Optional features → OpenSSH Server.
- Or [Tailscale SSH](https://tailscale.com/kb/1193/tailscale-ssh) (`tailscale set --ssh`),
  which signs you in by tailnet identity, no password. The app speaks the same protocol
  (tested against Go's `x/crypto/ssh`, which Tailscale SSH is built on) and shows any sign-in
  link Tailscale sends, though it hasn't been tried against Tailscale itself yet.

**Sign in with a key (optional).** Settings → SSH keys imports the keys you already use (paste an
OpenSSH private key, with its passphrase if it has one: Ed25519, ECDSA or RSA) or creates an
Ed25519 key that never leaves the phone, and shows the one command to run on each computer to
accept it. A connection offers every key unless you choose one for it. How keys are kept:
[docs/security.md](docs/security.md#ssh-keys).

**In the background.** On Android, while a session is open the app runs as a foreground service
(the "1 session connected" notification), so sessions stay connected and agent alerts keep
coming while you use other apps. Android needs notification permission to show it, which the
app asks for with the first session. iOS suspends apps soon after they leave the screen, so
there sessions drop and reconnect when you come back.

**Keep agents running.** If a connection drops (a network change, the phone out of signal),
the app reconnects by itself, and a shortcut's command runs again: run agents inside tmux or
zellij (agent shortcuts do) and that reattaches you to the same agent, still running.

**Agent shortcuts.** The session is named after the agent, so a second tap attaches instead of
starting another. In tmux they turn on mouse mode for that session only, so a swipe scrolls
tmux's history (zellij has it on already). Janus, Claude Code in `~/agents/janus`, skipping
permission prompts:

```bash
# tmux
cd ~/agents/janus && tmux new -A -s Janus claude --dangerously-skip-permissions \; set -q mouse on
# zellij: a layout that runs the agent (flare- prefixed, beside your own), then attach or start
mkdir -p ~/.config/zellij/layouts && echo 'layout { pane command="claude" { args "--dangerously-skip-permissions"; }; }' > ~/.config/zellij/layouts/flare-janus.kdl && cd ~/agents/janus && if zellij ls -s 2>/dev/null | grep -qx Janus; then zellij attach Janus; else zellij -s Janus -n flare-janus; fi
```

The skip flags are Claude Code's `--dangerously-skip-permissions`, Codex's
`--dangerously-bypass-approvals-and-sandbox` and Hermes's `--yolo`; pi never asks. Commands use
bash/zsh syntax. Edit one by hand and it's kept as you wrote it, until you choose "Use the
generated command".

**Alerts from Claude Code.** Out of the box, Claude Code only sends alerts to the terminals it
recognises (iTerm2, Ghostty, Kitty), and it can't tell what's on the other end of SSH. Tell it
once, on the computer, in `~/.claude/settings.json` (or `/config` → Local notifications):

```json
{ "preferredNotifChannel": "iterm2_with_bell" }
```

That sends a message (OSC 9) and rings the bell. Inside tmux the message needs
`set -g allow-passthrough on` in `~/.tmux.conf`; without it tmux passes only the bell, and the
alert says "Needs your attention". On iOS, phone notifications arrive only while the app is open
or recently left.

### ttyd (and the web build)

Browsers can't open TCP sockets, so the web build can't use SSH. It can connect to
[ttyd](https://github.com/tsl0922/ttyd) instead, which serves a shell over WebSocket; the
phone apps can use either. This does mean installing ttyd on the computer:

```bash
ttyd -W -i lo -c you:a-long-password tmux new -A -s main
tailscale serve --bg 7681     # then connect to https://<computer>.<tailnet>.ts.net
```

`-W` allows typing, `-c` requires a login (the web build can't send it, as browsers can't set
WebSocket headers; use it from the phone apps or behind a sign-in proxy). Run it with a UTF-8
locale, or tmux shows `_` for non-ASCII characters. Keep ttyd off the open internet: it hands
out a shell. The app warns when an address would send a session unencrypted over the internet.

## Develop

```bash
npm install
npm run check      # typecheck, lint, format, Jest, Playwright on the web build
npm start          # press w for web; native needs a development build
```

`AGENTS.md` has the conventions and the traps this stack has already hit, and
`docs/design.md` the look (tokens, type, when to use the accent). Try the keyboard without a
host at `/keyboard-preview`.

## How it works

```
 phone                                                          computer
┌───────────────────────────────────────────────────┐          ┌───────────────┐
│ session/[id]: TerminalView ('use dom' xterm.js),  │          │ sshd          │
│   coding keyboard, or key bar + text field        │          │  └ tmux       │
│      ▲ write, batched per frame    │ input        │          │    └ claude,  │
│ SessionManager: every open session, each with a   │   SSH    │      shells   │
│   headless xterm (screen, alerts) and a transport │◄────────►│               │
│ TerminalTransport ── SshTransport ── SshClient    │  or ttyd └───────────────┘
│                   └─ TtydTransport (WebSocket)    │
└───────────────────────────────────────────────────┘
```

- `src/features/terminal/terminal-view.tsx` only renders. On native, Expo runs it in a WebView;
  output reaches it through an imperative handle and input comes back through callbacks.
- `src/features/sessions/session-manager.ts` owns the sessions. Each keeps the host's output in
  an `@xterm/headless` terminal, so a session keeps its screen and catches alerts while no view
  shows it, and a view that attaches gets an exact replay.
- `src/features/terminal/transport.ts` is the seam between a session and a host.
  `ssh-transport.ts` runs `src/features/ssh/`, an SSH-2 client in TypeScript on audited
  [noble](https://paulmillr.com/noble/) cryptography: curve25519 key exchange with strict KEX,
  Ed25519 / ECDSA / RSA-SHA2 host keys, ChaCha20-Poly1305 and AES-GCM, rekeying, keepalives,
  and flow control. It is tested against the `ssh2` server in Jest, and was checked by hand
  against OpenSSH 9.6 and Go's `x/crypto/ssh`. `ttyd.ts` implements ttyd's protocol, checked
  by hand against ttyd 1.7.7; Playwright drives it against a fake host
  (`e2e/web/fake-ttyd.ts`).
- `src/features/reading/` is reading mode. Over SSH it asks tmux (`capture-pane`) or zellij
  (`dump-screen`) for the history, reads its colour codes itself (`history.ts`, many times
  quicker on a phone than a terminal parser), and finds agents' tool calls by their shapes
  (`transcript.ts`). Without a multiplexer, or over ttyd, it reads the session's headless
  terminal.
- `src/features/preview/` forwards a port for the dev server preview: a listener on the
  phone's 127.0.0.1 (`local-server.ts`) whose connections each open an SSH `direct-tcpip`
  channel to `localhost:<port>` on the host (`forward.ts`), shown in react-native-webview.

## Open source used

| Project                                                                                                  | Licence | Used for                                |
| -------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------- |
| [xterm.js](https://github.com/xtermjs/xterm.js), headless, and its fit, serialize, Unicode 11, web-links | MIT     | Terminal rendering, session screens     |
| [noble ciphers, curves and hashes](https://github.com/paulmillr)                                         | MIT     | SSH cryptography                        |
| [react-native-tcp-socket](https://github.com/Rapsssito/react-native-tcp-socket)                          | MIT     | SSH connections and the preview's port  |
| [react-native-webview](https://github.com/react-native-webview/react-native-webview)                     | MIT     | The dev server preview                  |
| [Expo](https://github.com/expo/expo) (DOM components, SecureStore, notifications, haptics)               | MIT     | App, WebView host, Keychain, alerts     |
| [ssh2](https://github.com/mscdex/ssh2)                                                                   | MIT     | Test SSH server (development only)      |
| [ttyd](https://github.com/tsl0922/ttyd)                                                                  | MIT     | Optional, on your computer; not shipped |
| [Geist and Geist Mono](https://github.com/vercel/geist-font) (`assets/fonts`, with its licence)          | OFL 1.1 | The app's typefaces                     |
| [Chakra Petch](https://github.com/m4rc1e/Chakra-Petch) (`assets/fonts`, with its licence)                | OFL 1.1 | Orbit's headings                        |
| [Tilt Neon](https://github.com/googlefonts/Tilt-Fonts) (`assets/fonts`, with its licence)                | OFL 1.1 | Neon's headings                         |
| [IBM Plex Mono](https://github.com/IBM/plex) (`assets/fonts`, with its licence)                          | OFL 1.1 | Concrete's typeface                     |
| Colour schemes: Tokyo Night (Apache-2.0), Catppuccin, Solarized, Gruvbox                                 | MIT     | Those themes' terminal colours          |

Projects that were evaluated and not used: Whip (an Expo, xterm.js and SSH terminal, but
AGPL), `@fressh/react-native-terminal` (MIT; a native SSH and terminal renderer, no web),
ghostty-web and wterm (renderers to revisit as they mature). The keyboard borrows ideas from
Thumb-Key, Unexpected Keyboard and Termux's extra keys.

## Roadmap

1. Mosh-style resilience: resume a dropped SSH session automatically on network changes.
2. Agent features: image and file hand-off, approve/deny buttons for agent prompts, alerts
   that reach the phone while the app is suspended (a small relay or push from the host).
3. Jump hosts, `~/.ssh/config` import, port forwarding beyond previews.
4. Touch selection, pinch to zoom, and a WebGL renderer.

## Limits

- The web checks prove logic, layout and the protocols. On-device behaviour (the WebView, TCP
  sockets, the soft keyboard and IMEs, Keychain/Keystore, notifications, haptics) needs a
  device run, as does the preview (its WebView and local port): `.maestro/terminal.yaml` covers the basics on EAS
  (`npx eas-cli@latest workflow:run .eas/workflows/e2e.yml`).
- SSH agent forwarding, X11 and SFTP aren't supported.

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
