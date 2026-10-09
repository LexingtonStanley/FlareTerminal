import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/hashes/utils.js';

/**
 * The vault key. While an app lock is set, every secret is sealed with it before it reaches
 * the Keychain/Keystore, so a dumped keychain is useless without the PIN or password
 * (src/features/vault explains the scheme). It lives only in memory: from the first unlock
 * until the app quits.
 */

const SEALED = 'fv1:';
const NONCE_BYTES = 24;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let vaultKey: Uint8Array | null = null;

export function setVaultKey(key: Uint8Array | null): void {
  vaultKey = key;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** XChaCha20-Poly1305 with a random nonce: base64 of nonce ‖ ciphertext ‖ tag. */
export function seal(key: Uint8Array, plaintext: Uint8Array): string {
  const nonce = randomBytes(NONCE_BYTES);
  const sealed = xchacha20poly1305(key, nonce).encrypt(plaintext);
  const out = new Uint8Array(NONCE_BYTES + sealed.length);
  out.set(nonce);
  out.set(sealed, NONCE_BYTES);
  return bytesToBase64(out);
}

/** The plaintext of `seal`; throws if the key is wrong or the data was changed. */
export function unseal(key: Uint8Array, text: string): Uint8Array {
  const bytes = base64ToBytes(text);
  return xchacha20poly1305(key, bytes.subarray(0, NONCE_BYTES)).decrypt(
    bytes.subarray(NONCE_BYTES)
  );
}

/** How a secret is stored: sealed while the vault has a key, as given otherwise. */
export function sealSecret(value: string): string {
  return vaultKey ? SEALED + seal(vaultKey, encoder.encode(value)) : value;
}

/** A stored secret's value, or null while it is sealed and the vault is locked. */
export function openSecret(stored: string): string | null {
  if (!stored.startsWith(SEALED)) return stored;
  if (!vaultKey) return null;
  try {
    return decoder.decode(unseal(vaultKey, stored.slice(SEALED.length)));
  } catch {
    return null;
  }
}
