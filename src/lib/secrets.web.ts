/**
 * Web has no secure storage, and a browser can't send credentials on a WebSocket
 * upgrade anyway, so nothing is kept. Screens hide password fields, and the app lock,
 * when `secretsSupported` is false.
 */

export const secretsSupported = false;

export function getSecret(_name: string): string | null {
  return null;
}

export function setSecret(_name: string, _value: string | null): void {}

export function resealSecrets(change: () => void, _names?: string[]): void {
  change();
}

export function getVaultItem(_name: string): string | null {
  return null;
}

export function setVaultItem(_name: string, _value: string | null): void {}

export function biometricsSupported(): boolean {
  return false;
}

export async function setBiometricItem(_name: string, _value: string | null): Promise<void> {}

export async function getBiometricItem(_name: string, _prompt: string): Promise<string | null> {
  return null;
}
