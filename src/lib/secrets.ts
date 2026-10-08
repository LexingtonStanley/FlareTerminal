import * as SecureStore from 'expo-secure-store';

/**
 * Passwords and keys, in the iOS Keychain / Android Keystore. Synchronous so a
 * session can connect without waiting. The web version (secrets.web.ts) keeps
 * nothing: browsers can't send ttyd credentials anyway.
 */

// SecureStore keys allow only letters, digits, '.', '-' and '_'.
const toKey = (name: string) => `flare.${name.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export const secretsSupported = true;

export function getSecret(name: string): string | null {
  return SecureStore.getItem(toKey(name));
}

export function setSecret(name: string, value: string | null): void {
  if (value) SecureStore.setItem(toKey(name), value);
  else void SecureStore.deleteItemAsync(toKey(name));
}
