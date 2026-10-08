import { getSecret, setSecret } from '@/lib/secrets';

import { fromBase64, toBase64 } from './bytes';
import { generateUserKey, userKeyFromSeed, type UserKey } from './user-key';

/**
 * The app's SSH key, kept in the Keychain/Keystore. Optional: it lets a computer
 * that lists it in ~/.ssh/authorized_keys skip the password.
 */

const SECRET_NAME = 'ssh.app-key.ed25519';

export function loadAppKey(): UserKey | null {
  const seed = getSecret(SECRET_NAME);
  return seed ? userKeyFromSeed(fromBase64(seed)) : null;
}

export function createAppKey(): UserKey {
  const key = generateUserKey();
  setSecret(SECRET_NAME, toBase64(key.seed));
  return key;
}

export function deleteAppKey(): void {
  setSecret(SECRET_NAME, null);
}
