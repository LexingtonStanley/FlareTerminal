import { hmac } from '@noble/hashes/hmac.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';

import {
  getBiometricItem,
  getVaultItem,
  resealSecrets,
  setBiometricItem,
  setVaultItem,
} from '@/lib/secrets';
import { readJson, writeJson } from '@/lib/storage';
import { base64ToBytes, bytesToBase64, seal, setVaultKey, unseal } from '@/lib/vault-key';

/**
 * The app lock and the encrypted vault behind it.
 *
 * Every secret already sits in the Keychain/Keystore. Setting a lock adds a layer: a random
 * 256-bit vault key seals each secret (XChaCha20-Poly1305, src/lib/vault-key.ts). The vault
 * key is kept only wrapped: by a key derived from the PIN or password (scrypt), and, when
 * biometrics are on, in a Keychain/Keystore item that only Face ID, Touch ID or a
 * fingerprint can read. Without a lock, secrets are stored as before.
 *
 * Once unlocked, the vault key stays in memory until the app quits, so open sessions can
 * reconnect while the screen is locked. Later checks of the PIN (auto-lock, protected
 * connections) compare a keyed hash held in memory, so they are instant.
 */

export type LockKind = 'pin' | 'password';

/** Seconds in the background before the app locks again. */
export const AUTO_LOCK_CHOICES = [0, 60, 300, 900] as const;
export type AutoLock = (typeof AUTO_LOCK_CHOICES)[number];

export type LockSettings = { kind: LockKind; biometrics: boolean; autoLock: AutoLock };

type StoredLock = LockSettings & {
  v: 1;
  /** scrypt parameters and salt for the key that wraps the vault key. */
  kdf: { N: number; r: number; p: number; salt: string };
  /** The vault key, sealed with the derived key. */
  wrapped: string;
  /** HMAC of a fixed string under the vault key: checks a key read back via biometrics. */
  check: string;
};

export type UnlockResult = { ok: true } | { ok: false; retryAt: number | null };

const LOCK_ITEM = 'vault.lock';
const BIOMETRIC_ITEM = 'vault.key.biometric';
const ATTEMPTS_KEY = 'flare.vault.attempts.v1';

/** Wrong guesses allowed before each further one makes the next wait twice as long. */
export const FREE_ATTEMPTS = 5;
const FIRST_WAIT_MS = 30_000;
const MAX_WAIT_MS = 60 * 60_000;

/** About 0.2 s on a laptop and a second or two on a phone; 32 MiB of memory. */
const DEFAULT_COST = { N: 2 ** 15, r: 8, p: 1 };
const encoder = new TextEncoder();

export function validateLockSecret(kind: LockKind, secret: string): string | null {
  if (kind === 'pin') {
    if (!/^\d+$/.test(secret)) return 'Use digits only';
    if (secret.length < 6) return 'Use at least 6 digits';
    return null;
  }
  if (secret.length < 8) return 'Use at least 8 characters';
  return null;
}

function keyCheck(key: Uint8Array): string {
  return bytesToBase64(hmac(sha256, key, encoder.encode('flare vault check')));
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type VaultOptions = {
  now?: () => number;
  /** scrypt cost; tests lower it. */
  cost?: { N: number; r: number; p: number };
};

export class Vault {
  private key: Uint8Array | null = null;
  /** HMAC of the PIN/password under the vault key, for instant re-checks. */
  private secretCheck: Uint8Array | null = null;

  constructor(private readonly options: VaultOptions = {}) {}

  private now() {
    return (this.options.now ?? Date.now)();
  }

  private stored(): StoredLock | null {
    const raw = getVaultItem(LOCK_ITEM);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredLock;
    } catch {
      return null;
    }
  }

  private store(lock: StoredLock | null) {
    setVaultItem(LOCK_ITEM, lock ? JSON.stringify(lock) : null);
  }

  /** The lock's settings, or null when there is no app lock. */
  settings(): LockSettings | null {
    const lock = this.stored();
    return lock ? { kind: lock.kind, biometrics: lock.biometrics, autoLock: lock.autoLock } : null;
  }

  isOpen(): boolean {
    return this.key !== null;
  }

  private open(key: Uint8Array, secret: string | null) {
    this.key = key;
    if (secret !== null) this.secretCheck = hmac(sha256, key, encoder.encode(secret));
    setVaultKey(key);
  }

  /** Forgets the key (the app restarting does the same). */
  close() {
    this.key = null;
    this.secretCheck = null;
    setVaultKey(null);
  }

  private async wrap(key: Uint8Array, kind: LockKind, secret: string) {
    const cost = this.options.cost ?? DEFAULT_COST;
    const salt = randomBytes(16);
    const derived = await scryptAsync(secret, salt, { ...cost, dkLen: 32 });
    return {
      kind,
      kdf: { ...cost, salt: bytesToBase64(salt) },
      wrapped: seal(derived, key),
    };
  }

  /**
   * Turns the lock on: a new vault key, every secret resealed with it. `secretNames` adds
   * secrets saved before the app recorded names (connection passwords, the app key).
   */
  async create(kind: LockKind, secret: string, secretNames: string[] = []): Promise<void> {
    const key = randomBytes(32);
    const wrapped = await this.wrap(key, kind, secret);
    resealSecrets(() => {
      this.store({ v: 1, ...wrapped, biometrics: false, autoLock: 60, check: keyCheck(key) });
      this.open(key, secret);
    }, secretNames);
    this.resetAttempts();
  }

  /** A new PIN or password for the same vault key. The vault must be open. */
  async change(kind: LockKind, secret: string): Promise<void> {
    const lock = this.stored();
    if (!lock || !this.key) throw new Error('The vault is locked');
    const wrapped = await this.wrap(this.key, kind, secret);
    this.store({ ...lock, ...wrapped });
    this.open(this.key, secret);
  }

  /** Turns the lock off: secrets are stored unsealed again. The vault must be open. */
  async remove(secretNames: string[] = []): Promise<void> {
    if (!this.key) throw new Error('The vault is locked');
    resealSecrets(() => {
      this.store(null);
      this.close();
    }, secretNames);
    await setBiometricItem(BIOMETRIC_ITEM, null).catch(() => {});
  }

  async setBiometrics(on: boolean): Promise<void> {
    const lock = this.stored();
    if (!lock || !this.key) throw new Error('The vault is locked');
    await setBiometricItem(BIOMETRIC_ITEM, on ? bytesToBase64(this.key) : null);
    this.store({ ...lock, biometrics: on });
  }

  setAutoLock(autoLock: AutoLock) {
    const lock = this.stored();
    if (lock) this.store({ ...lock, autoLock });
  }

  // ───────── unlocking ─────────

  /** When the next guess is allowed, or null if now. */
  retryAt(): number | null {
    const { until } = this.attempts();
    return until > this.now() ? until : null;
  }

  private attempts(): { failures: number; until: number } {
    return readJson<{ failures: number; until: number }>(ATTEMPTS_KEY) ?? { failures: 0, until: 0 };
  }

  private resetAttempts() {
    writeJson(ATTEMPTS_KEY, { failures: 0, until: 0 });
  }

  private fail(): UnlockResult {
    const failures = this.attempts().failures + 1;
    const extra = failures - FREE_ATTEMPTS;
    const until = extra >= 0 ? this.now() + Math.min(MAX_WAIT_MS, FIRST_WAIT_MS * 2 ** extra) : 0;
    writeJson(ATTEMPTS_KEY, { failures, until });
    return { ok: false, retryAt: until || null };
  }

  /** Checks the PIN or password, opening the vault if it isn't open yet. */
  async unlock(secret: string): Promise<UnlockResult> {
    const lock = this.stored();
    if (!lock) return { ok: true };
    const retryAt = this.retryAt();
    if (retryAt) return { ok: false, retryAt };

    if (this.key && this.secretCheck) {
      const typed = hmac(sha256, this.key, encoder.encode(secret));
      if (!equal(typed, this.secretCheck)) return this.fail();
      this.resetAttempts();
      return { ok: true };
    }

    const { N, r, p, salt } = lock.kdf;
    const derived = await scryptAsync(secret, base64ToBytes(salt), { N, r, p, dkLen: 32 });
    let key: Uint8Array;
    try {
      key = unseal(derived, lock.wrapped);
    } catch {
      return this.fail();
    }
    this.open(key, secret);
    this.resetAttempts();
    return { ok: true };
  }

  /** Asks for Face ID, Touch ID or a fingerprint; true if it opened (or confirmed) the vault. */
  async unlockWithBiometrics(prompt: string): Promise<boolean> {
    const lock = this.stored();
    if (!lock?.biometrics) return false;
    const stored = await getBiometricItem(BIOMETRIC_ITEM, prompt);
    if (!stored) return false;
    const key = base64ToBytes(stored);
    if (keyCheck(key) !== lock.check) return false;
    if (this.key && !equal(key, this.key)) return false;
    if (!this.key) this.open(key, null);
    this.resetAttempts();
    return true;
  }
}
