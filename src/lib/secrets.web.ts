/**
 * Web has no secure storage, and a browser can't send credentials on a WebSocket
 * upgrade anyway, so nothing is kept. Screens hide password fields when
 * `secretsSupported` is false.
 */

export const secretsSupported = false;

export function getSecret(_name: string): string | null {
  return null;
}

export function setSecret(_name: string, _value: string | null): void {}
