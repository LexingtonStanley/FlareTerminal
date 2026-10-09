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
const vaultItems = new Map<string, string>();
const biometricItems = new Map<string, string>();

/** The pretend phone's biometrics: whether it has them, and whether the next scan passes. */
export const biometrics = { supported: false, approve: true, prompts: [] as string[] };

export function clearMemoryStorage() {
  values.clear();
  secrets.clear();
  vaultItems.clear();
  biometricItems.clear();
  Object.assign(biometrics, { supported: false, approve: true, prompts: [] });
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

export function resealSecrets(change: () => void) {
  change();
}

export function getVaultItem(name: string) {
  return vaultItems.get(name) ?? null;
}

export function setVaultItem(name: string, value: string | null) {
  if (value) vaultItems.set(name, value);
  else vaultItems.delete(name);
}

export function biometricsSupported() {
  return biometrics.supported;
}

export async function setBiometricItem(name: string, value: string | null) {
  if (value) biometricItems.set(name, value);
  else biometricItems.delete(name);
}

export async function getBiometricItem(name: string, prompt: string) {
  biometrics.prompts.push(prompt);
  return biometrics.approve ? (biometricItems.get(name) ?? null) : null;
}
