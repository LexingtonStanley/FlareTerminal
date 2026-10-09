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

## Limits

- A 6-digit PIN can't resist an offline guessing attack on its own: someone with the phone's
  keychain and a lot of patience could try them all. The keychain is hardware-protected, which
  is the real barrier. A password is much stronger, and the setup screen says so.
- The web build has no secure storage and no lock (`secretsSupported` is false).
- Lose the PIN and the saved passwords and keys are gone. Host keys and connections stay.
