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

Once unlocked, the vault key stays in memory until the app quits, so open sessions keep their
credentials and can reconnect while the screen is locked. The lock screen covers the app; it
doesn't stop sessions. A "forget the key on lock" option is on the roadmap.

## Protected connections and groups

A connection or group can require the lock every time you come back to its sessions
(`AccessGuard`, `src/app/session/[id].tsx`). Their sessions keep running. While locked, their
screen isn't shown, and their alerts show only "Needs your attention" in lists, banners and
notifications. Moving between sessions of the same protected group doesn't ask again; going
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

## Limits

- A 6-digit PIN can't resist an offline guessing attack on its own: someone with the phone's
  keychain and a lot of patience could try them all. The keychain is hardware-protected, which
  is the real barrier. A password is much stronger, and the setup screen says so.
- The web build has no secure storage and no lock (`secretsSupported` is false).
- Lose the PIN and the saved passwords and keys are gone. Host keys and connections stay.
