/**
 * In-memory stand-ins for src/lib/storage.ts and src/lib/secrets.ts (the real ones
 * use SQLite and the Keychain/Keystore, which Jest doesn't have):
 *
 *   jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
 *   jest.mock('@/lib/secrets', () => jest.requireActual('@/test-utils/memory-storage'));
 *   beforeEach(() => clearMemoryStorage());
 */

const values = new Map<string, string>();
export const secrets = new Map<string, string>();

export function clearMemoryStorage() {
  values.clear();
  secrets.clear();
}

export function readJson<T>(key: string): T | null {
  const raw = values.get(key);
  return raw === undefined ? null : (JSON.parse(raw) as T);
}

export function writeJson(key: string, value: unknown) {
  values.set(key, JSON.stringify(value));
}

export const secretsSupported = true;

export function getSecret(name: string) {
  return secrets.get(name) ?? null;
}

export function setSecret(name: string, value: string | null) {
  if (value) secrets.set(name, value);
  else secrets.delete(name);
}
