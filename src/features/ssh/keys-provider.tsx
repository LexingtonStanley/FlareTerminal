import { createContext, use, useState, type PropsWithChildren } from 'react';

import { useLock } from '@/features/vault/lock-provider';
import { secretsSupported } from '@/lib/secrets';

import { deleteAppKey } from './app-key';
import {
  APP_KEY_ID,
  createAppKeyEntry,
  deletePrivateKey,
  describeSavedKey,
  newKeyId,
  readAppKey,
  readImportedKeys,
  storePrivateKey,
  writeImportedKeys,
  type SavedKey,
} from './keys';
import type { ImportedKey } from './private-key';
import { describeKey } from './user-key';

type KeysContextValue = {
  /** The app's own key first (once made), then imported keys. Always empty on the web. */
  keys: SavedKey[];
  createAppKey(): SavedKey;
  /** Saves an imported key under `name` (its comment, or its type, when blank). */
  importKey(name: string, imported: ImportedKey): SavedKey;
  rename(id: string, name: string): void;
  remove(id: string): void;
};

const KeysContext = createContext<KeysContextValue | null>(null);

const listedAppKey = () => (secretsSupported ? readAppKey() : null);

export function KeysProvider({ children }: PropsWithChildren) {
  const { locked } = useLock();
  const [imported, setImported] = useState(() => (secretsSupported ? readImportedKeys() : []));
  const [appKey, setAppKey] = useState(listedAppKey);
  // The app key is a secret, sealed until the vault opens: read it again once it does.
  const [wasLocked, setWasLocked] = useState(locked);
  if (wasLocked !== locked) {
    setWasLocked(locked);
    setAppKey(listedAppKey());
  }

  function commit(next: SavedKey[]) {
    writeImportedKeys(next);
    setImported(next);
  }

  const value: KeysContextValue = {
    keys: appKey ? [appKey, ...imported] : imported,
    createAppKey() {
      const saved = createAppKeyEntry();
      setAppKey(saved);
      return saved;
    },
    importKey(name, { key, comment }) {
      const id = newKeyId();
      const fallback = comment.trim() || `${describeKey(key)} key`;
      storePrivateKey(id, key);
      const saved = describeSavedKey(id, name.trim() || fallback, key, comment);
      commit([...readImportedKeys(), saved]);
      return saved;
    },
    // These read the list from storage rather than this render's state, so a late call (a
    // name field blurring as its key is deleted) can't bring back a key that's gone.
    rename(id, name) {
      if (id === APP_KEY_ID || !name.trim()) return;
      commit(
        readImportedKeys().map((key) => (key.id === id ? { ...key, name: name.trim() } : key))
      );
    },
    remove(id) {
      if (id === APP_KEY_ID) {
        deleteAppKey();
        setAppKey(null);
        return;
      }
      deletePrivateKey(id);
      commit(readImportedKeys().filter((key) => key.id !== id));
    },
  };

  return <KeysContext value={value}>{children}</KeysContext>;
}

export function useKeys(): KeysContextValue {
  const value = use(KeysContext);
  if (!value) throw new Error('useKeys must be used inside <KeysProvider>');
  return value;
}
