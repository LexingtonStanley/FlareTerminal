import { ed25519 } from '@noble/curves/ed25519.js';
import { randomBytes } from '@noble/hashes/utils.js';

import { SshWriter, toBase64 } from './bytes';

/**
 * The app's own login key (Ed25519). Only the 32-byte seed is stored; the public key
 * is derived from it. Add `publicKeyLine()` to ~/.ssh/authorized_keys on a computer to
 * sign in without a password.
 */
export type UserKey = { seed: Uint8Array; publicKey: Uint8Array };

export const USER_KEY_ALGORITHM = 'ssh-ed25519';

export function generateUserKey(): UserKey {
  return userKeyFromSeed(randomBytes(32));
}

export function userKeyFromSeed(seed: Uint8Array): UserKey {
  return { seed, publicKey: ed25519.getPublicKey(seed) };
}

export function publicKeyBlob(key: UserKey): Uint8Array {
  return new SshWriter().string(USER_KEY_ALGORITHM).string(key.publicKey).toBytes();
}

/** The authorized_keys line, e.g. `ssh-ed25519 AAAAC3… flare-terminal`. */
export function publicKeyLine(key: UserKey, comment = 'flare-terminal'): string {
  return `${USER_KEY_ALGORITHM} ${toBase64(publicKeyBlob(key))} ${comment}`;
}

/** An SSH signature blob over `data`. */
export function signWithUserKey(key: UserKey, data: Uint8Array): Uint8Array {
  return new SshWriter().string(USER_KEY_ALGORITHM).string(ed25519.sign(data, key.seed)).toBytes();
}
