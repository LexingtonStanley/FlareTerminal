import { quote } from '@/features/shortcuts/shell';
import { getSecret, setSecret } from '@/lib/secrets';
import { readJson, writeJson } from '@/lib/storage';

import { loadAppKey } from './app-key';
import { fromBase64, SshReader, toBase64 } from './bytes';
import { fingerprint } from './host-keys';
import {
  describeKey,
  publicKeyBlob,
  publicKeyLine,
  readPrivateFields,
  writePrivateFields,
  type UserKey,
} from './user-key';

/**
 * The person's SSH keys: the app's own key (app-key.ts) and keys they imported. What a list
 * shows (name, type, public key) is plain storage; the private half of an imported key is a
 * secret, sealed with the vault key while an app lock is set.
 */

export type SavedKey = {
  id: string;
  name: string;
  /** As `ssh-keygen -l` puts it: "ED25519", "ECDSA 256", "RSA 4096". */
  kind: string;
  /** The authorized_keys line, with the key file's comment. */
  publicKey: string;
  /** `SHA256:…`, as `ssh-keygen -l` prints it. */
  fingerprint: string;
};

const STORAGE_KEY = 'flare.ssh-keys.v1';

/** The app's own key in lists and in a connection's key choice. */
export const APP_KEY_ID = 'flare';
/** A connection's key choice for "don't offer a key". Absent means every key. */
export const NO_KEY = 'none';

const keySecret = (id: string) => `ssh.key.${id}`;

export function newKeyId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function describeSavedKey(id: string, name: string, key: UserKey, comment = ''): SavedKey {
  return {
    id,
    name,
    kind: describeKey(key),
    // One line in authorized_keys, whatever the key file's comment holds.
    publicKey: publicKeyLine(key, comment.replace(/\p{Cc}+/gu, ' ').trim()),
    fingerprint: fingerprint(publicKeyBlob(key)),
  };
}

export function readImportedKeys(): SavedKey[] {
  return readJson<SavedKey[]>(STORAGE_KEY) ?? [];
}

export function writeImportedKeys(keys: SavedKey[]): void {
  writeJson(STORAGE_KEY, keys);
}

/** Keeps an imported key's private half in the vault. */
export function storePrivateKey(id: string, key: UserKey): void {
  setSecret(keySecret(id), toBase64(writePrivateFields(key)));
}

export function deletePrivateKey(id: string): void {
  setSecret(keySecret(id), null);
}

/** A key's private half, or null when it's gone or the vault is still locked. */
export function loadKey(id: string): UserKey | null {
  if (id === APP_KEY_ID) return loadAppKey();
  const stored = getSecret(keySecret(id));
  if (!stored) return null;
  try {
    return readPrivateFields(new SshReader(fromBase64(stored)));
  } catch {
    return null;
  }
}

/**
 * The keys a connection offers, in order. Its chosen key alone, none for NO_KEY, and every
 * key (the app's first) when it has no choice or its key was deleted.
 */
export function keysForConnection(keyId: string | null | undefined): UserKey[] {
  if (keyId === NO_KEY) return [];
  const chosen = keyId ? loadKey(keyId) : null;
  if (chosen) return [chosen];
  return [APP_KEY_ID, ...readImportedKeys().map(({ id }) => id)]
    .map(loadKey)
    .filter((key) => key !== null);
}

/** The shell command that authorizes a public key on a computer. */
export function authorizeCommand(publicKey: string): string {
  return `mkdir -p ~/.ssh && echo ${quote(publicKey)} >> ~/.ssh/authorized_keys`;
}
