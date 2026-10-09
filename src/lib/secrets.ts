import * as SecureStore from 'expo-secure-store';

import { readJson, writeJson } from './storage';
import { openSecret, sealSecret } from './vault-key';

/**
 * Passwords and keys, in the iOS Keychain / Android Keystore. Synchronous so a
 * session can connect without waiting. While an app lock is set they are also sealed
 * with the vault key (vault-key.ts). The web version (secrets.web.ts) keeps nothing:
 * browsers can't send ttyd credentials anyway.
 */

// SecureStore keys allow only letters, digits, '.', '-' and '_'.
const toKey = (name: string) => `flare.${name.replace(/[^A-Za-z0-9._-]/g, '_')}`;

/** Names of the secrets saved, so they can all be resealed. The names aren't secret. */
const NAMES_KEY = 'flare.secret-names.v1';

/** The vault's own items: never backed up or moved to another device. */
const VAULT_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secretsSupported = true;

function savedNames(): string[] {
  return readJson<string[]>(NAMES_KEY) ?? [];
}

function remember(name: string, saved: boolean) {
  const names = savedNames().filter((existing) => existing !== name);
  writeJson(NAMES_KEY, saved ? [...names, name] : names);
}

export function getSecret(name: string): string | null {
  const stored = SecureStore.getItem(toKey(name));
  return stored === null ? null : openSecret(stored);
}

export function setSecret(name: string, value: string | null): void {
  remember(name, Boolean(value));
  if (value) SecureStore.setItem(toKey(name), sealSecret(value));
  else void SecureStore.deleteItemAsync(toKey(name));
}

/**
 * Reads every secret, runs `change` (which sets or clears the vault key), then writes
 * them back sealed the new way. `names` adds secrets saved before names were recorded.
 */
export function resealSecrets(change: () => void, names: string[] = []): void {
  const all = [...new Set([...savedNames(), ...names])];
  const values = all.map((name) => [name, getSecret(name)] as const);
  change();
  for (const [name, value] of values) if (value !== null) setSecret(name, value);
}

/** One of the vault's own items (the wrapped key, the lock settings), stored as given. */
export function getVaultItem(name: string): string | null {
  return SecureStore.getItem(toKey(name), VAULT_OPTIONS);
}

export function setVaultItem(name: string, value: string | null): void {
  if (value) SecureStore.setItem(toKey(name), value, VAULT_OPTIONS);
  else void SecureStore.deleteItemAsync(toKey(name), VAULT_OPTIONS);
}

/** Whether the phone can keep an item behind Face ID, Touch ID or a fingerprint. */
export function biometricsSupported(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

const biometricOptions = (prompt?: string): SecureStore.SecureStoreOptions => ({
  ...VAULT_OPTIONS,
  requireAuthentication: true,
  authenticationPrompt: prompt,
});

/** Saves an item that only biometrics can read back. Changing the enrolled faces or fingers voids it. */
export async function setBiometricItem(name: string, value: string | null): Promise<void> {
  if (value) await SecureStore.setItemAsync(toKey(name), value, biometricOptions());
  else await SecureStore.deleteItemAsync(toKey(name), biometricOptions());
}

/** Asks for biometrics and reads the item; null if the person cancels or it fails. */
export async function getBiometricItem(name: string, prompt: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(toKey(name), biometricOptions(prompt));
  } catch {
    return null;
  }
}
