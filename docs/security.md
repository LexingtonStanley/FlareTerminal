# App lock and the encrypted vault

Flare has no server and no accounts: everything it knows lives on the phone. This page is how
it protects that, and what it doesn't protect against.

## Layers

1. **Keychain / Keystore.** Every password and key is in the iOS Keychain or the Android
   Keystore (`src/lib/secrets.ts`), as before the lock existed.
2. **The vault key.** Turning on an app lock creates a random 256-bit key and reseals every
   secret with it (XChaCha20-Poly1305, `src/lib/vault-key.ts`). A copy of the keychain is then
   useless without the PIN or password.
3. **The PIN or password** never gets stored. A key derived from it (scrypt, N = 2^15, r = 8,
   p = 1, a random salt) wraps the vault key, and the wrapped key sits in the keychain
   (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so not in backups).
4. **Biometrics** (optional). A second copy of the vault key goes in a keychain item that only
   Face ID, Touch ID or an enrolled fingerprint can read (`requireAuthentication`). Changing the
   enrolled faces or fingers voids it; the PIN still works.

Without a lock, secrets are stored as in layer 1 only.

## Unlocking

- A cold start needs the PIN, password or biometrics; that opens the vault.
- Re-checks while the app runs (auto-lock, protected connections and groups) compare an HMAC of
  what was typed under the vault key, held in memory, so they are instant.
- After five wrong guesses each guess waits twice as long as the last, from 30 seconds up to
  an hour, across restarts.

## What stays open

Once unlocked, the vault key stays in memory until the app quits, so sessions can reconnect
while the screen is locked. The lock screen covers the app; it doesn't stop sessions.

**Forget the key when locked** (Security settings, off by default) trades that for a closed
vault while locked:

- Locking forgets the vault key and the PIN check held with it, as a restart does. Nothing
  can read a saved password or key until the next unlock, which derives the key again (a
  second or two for a PIN or password; instant with biometrics).
- It happens when the lock does: at once on "Lock now", and once Flare has been away for the
  auto-lock time. While sessions are open on Android, Flare keeps running in the background
  and forgets it on time. Otherwise the phone may pause Flare first (iOS always does, soon
  after it leaves the screen), and the key goes when Flare next runs. An auto-lock of
  "At once" forgets it as Flare leaves the screen, on both.
- Open sessions keep running. A session that drops while locked waits for the unlock rather
  than trying without its password or key, then reconnects.
- While the key is forgotten, saving a secret fails rather than store it unsealed.

Either way, an SSH session drops its password and keys once it has signed in, so an open
session doesn't keep them in memory. JavaScript can't overwrite a string, so this removes the
references and leaves the memory to be reclaimed; it doesn't scrub it. A ttyd session keeps
its login for the life of its connection.

## Protected connections and groups

A connection or group can require the lock every time you come back to its sessions
(`AccessGuard`, `src/app/session/[id].tsx`). Their sessions keep running. While locked, their
screen isn't shown, and their alerts show only "Needs your attention" in lists, banners and
notifications. Android's live status (the ongoing notification) leaves their names and
questions out too, as "A session needs you". Moving between sessions of the same protected group doesn't ask again; going
anywhere else, or leaving the app, does.

A connection can also be set not to stay connected: its sessions close when you leave them or
the app.

## SSH keys

- **Where they come from.** The Flare key is an Ed25519 key made on the phone. Other keys are
  imported from OpenSSH key files (`-----BEGIN OPENSSH PRIVATE KEY-----`,
  `src/features/ssh/private-key.ts`): Ed25519, ECDSA (P-256, P-384, P-521) and RSA. Older PEM
  files, PuTTY keys and security keys (`sk-…`) get a message saying how to convert them.
- **Passphrases** decrypt a key once, at import (bcrypt_pbkdf and AES, as OpenSSH does), and are
  never kept. From then on the private half is a secret like a password: in the Keychain or
  Keystore, sealed with the vault key while an app lock is set. The app lock is what protects
  it afterwards, so a key with a passphrase is best paired with one. An imported key's public
  half, name and fingerprint are plain storage, so lists show them without unlocking.
- **Signing.** Ed25519 and ECDSA come from @noble (ECDSA with RFC 6979 nonces, so no random
  number to get wrong). RSA signs `rsa-sha2-512` or `rsa-sha2-256`, never SHA-1; it is
  blinded, so how long it takes doesn't depend on what it signs, and each signature is checked
  before it is sent, since a miscalculated one would give the key away.
- **What a host sees.** A connection offers its chosen key, or every key (the Flare key first)
  when none is chosen. Flare asks the host about each key before signing (RFC 4252), so a host
  only gets a signature from a key it accepts. It still learns the public keys offered; choose
  a key for a connection, or None, to offer fewer.
- **Leaving the phone.** Only public halves can be copied or shared. A key pasted with the
  Paste button is cleared from the clipboard once imported.

## Dev server previews

The preview forwards one port on the host to the phone, like `ssh -L 3000:localhost:3000`,
through the session's SSH connection (`src/features/preview/`). Each connection the browser
makes opens a `direct-tcpip` channel to `localhost:<port>` as the host resolves it; the host's
`AllowTcpForwarding` decides whether that's allowed.

- **Who can reach the port.** The phone listens on 127.0.0.1 only, so other devices on the
  network can't use it. Other apps on the same phone can while the preview is open, as with
  any `ssh -L`. The port closes when the preview closes; its connections close then too, or
  when the session drops. The browser opens `localhost`, which can also mean `::1`: an app
  already listening there on the same port would answer instead of the host.
- **What the browser keeps.** Cookies, storage and the cache stay between previews, so a
  login sticks, as in a desktop browser (chosen over starting clean each time). The
  same goes across computers: two hosts previewed on the same port share that origin's
  storage, cookies for `localhost` are sent to every port, and a service worker one page
  registers can see later pages on its port.
- **The page is the host's content**, untrusted like terminal output. The web view loads only
  `http`, `https`, `about`, `blob` and `data` addresses, so a page can't open other apps or
  Flare's own links, and new windows stay in the preview. Nothing connects the page to the
  app: no message handler, no injected objects. "Open in browser" hands only `http(s)`
  addresses to the system browser.
- **Protected connections** guard the preview as they guard the session's screen.

## Images sent to the host

The image button sends a screenshot or photo through the session's SSH connection
(`src/features/images/`), for an agent to read.

- **Only what you pick.** Flare reads the clipboard only when you tap Paste (iOS then asks
  whether Flare may paste), and photos only through the system picker, which shows Flare
  just the one you choose. The camera asks for permission the first time. The picker leaves
  a copy in Flare's cache folder, which the phone clears when it needs space.
- **On the host** each image is a new file in `~/.flare/uploads/`, made by one `sh -c`
  command with `umask 077`, so the folder and files are readable only by your account. Flare
  never deletes them; clear the folder when you like. The command is built from a fixed
  script and a name Flare makes up (`flare-<date>-<time>-<random>.<type>`), never from
  anything typed, and the image goes in as input, never as part of the command.
- **What a photo carries.** A photo from the library or the camera goes as a fresh JPEG
  (80% quality) that the picker encodes from the pixels, so none of the original's metadata
  goes with it, where it was taken included (expo-image-picker's `base64` on both
  platforms). A screenshot pasted from the clipboard goes as PNG. The file type comes from
  the image's own first bytes; anything that isn't a PNG, JPEG, GIF, WebP or HEIC isn't sent.

## Files from agents

Markdown and HTML that an agent saves in `~/.flare/outbox/` come to the phone through the
session's SSH connection (`src/features/outbox/`). A file is the host's content, untrusted like
terminal output.

- **What runs on the host.** While an SSH session is open (and "Files from agents" is on in
  Settings), one `sh -s` script beside it lists the folder every 5 seconds, and a second prints
  a file that's new or changed. Both are fixed scripts that only read; a file's name is quoted
  for sh. Flare makes nothing on the host and deletes nothing there. Only regular files
  ending in `.md`, `.markdown`, `.html` or `.htm` come over, never a symbolic link, so a link
  in the folder can't send a file from elsewhere. Files over 5 MB stay on the host.
- **What the phone keeps.** The newest 50 files (up to 20 MB) in Flare's own storage, like the
  connections list: the phone's file encryption protects them, and the app lock protects the
  screens that show them, not the files themselves. Delete removes the phone's copy; the
  host's stays, and comes again only if it changes.
- **Markdown** becomes a page Flare makes (marked), with any HTML in the file shown as text,
  so the file can't add a script, a form or a redirect. The page loads nothing: its
  Content-Security-Policy allows only its own styles and `data:` images, and JavaScript is off.
  A tapped `http(s)` link opens in the browser; every other address does nothing.
- **HTML** shows as the agent made it, with JavaScript off and the same policy, so it loads
  nothing from the internet (no tracking pixels) until you turn on Run scripts for that
  file. Then the page runs as a website would, loading what it asks for. Either way nothing
  connects it to the app (no message handler, no injected objects), and a page can't open
  anything on its own: when it tries to go to an `http(s)` address, Flare shows the address
  and asks before opening it in the browser.
- **Protected connections and groups.** Their files' names stay out of notifications, banners
  and the inbox, and opening one asks for the lock, as their sessions do.

## Importing an SSH config

Import adds connections from an OpenSSH config (`src/features/connections/ssh-config.ts`).
Only each host's name, HostName, User and Port are kept. IdentityFile lines are ignored, so no
key leaves the computer this way (import keys in Settings → SSH keys), and a config holds no
passwords.

- **Pasted**, the text is read on the phone and not kept.
- **Read from a computer** you're connected to, one `sh -s` script beside the session prints
  `~/.ssh/config`, then a second prints the files its `Include` lines name. Both only read.
  An Include pattern goes into the script in single quotes and expands as a glob in sh, which
  doesn't run anything inside it (no command substitution), so a config can't make Flare run
  a command. Each file follows a line with a random marker, so a file can't pass for the end
  of another.
- `Match` blocks are skipped (they test the computer they run on, `Match exec` runs commands),
  and Flare says so.
- **Protected connections and groups.** While an app lock is set, their computers aren't
  offered to read from, as their screens aren't shown.

## Limits

- A 6-digit PIN can't resist an offline guessing attack on its own: someone with the phone's
  keychain and a lot of patience could try them all. The keychain is hardware-protected, which
  is the real barrier. A password is much stronger, and the setup screen says so.
- The web build has no secure storage and no lock (`secretsSupported` is false).
- Lose the PIN and the saved passwords and keys are gone. Host keys and connections stay.
