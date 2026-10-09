import { ed25519 } from '@noble/curves/ed25519.js';
import { p256, p384, p521 } from '@noble/curves/nist.js';
import { randomBytes } from '@noble/hashes/utils.js';

import { bigIntToBytes, bytesToBigInt, equalBytes, SshReader, SshWriter, toBase64 } from './bytes';
import {
  byteLength,
  isRsaSignatureAlgorithm,
  modInverse,
  modPow,
  pkcs1Encode,
  type RsaSignatureAlgorithm,
} from './rsa';

/**
 * Keys that sign the person in (RFC 4252 publickey): the app's own Ed25519 key, and keys
 * imported from OpenSSH files (private-key.ts). Private parts never leave the phone; the
 * host only sees signatures.
 */

export type Ed25519Key = { type: 'ssh-ed25519'; seed: Uint8Array; publicKey: Uint8Array };

export type EcdsaKeyType = 'ecdsa-sha2-nistp256' | 'ecdsa-sha2-nistp384' | 'ecdsa-sha2-nistp521';
/** `privateKey` is the scalar at the curve's size; `publicKey` the uncompressed point. */
export type EcdsaKey = { type: EcdsaKeyType; privateKey: Uint8Array; publicKey: Uint8Array };

export type RsaKey = {
  type: 'ssh-rsa';
  n: bigint;
  e: bigint;
  d: bigint;
  p: bigint;
  q: bigint;
  /** q⁻¹ mod p, for signing with the Chinese remainder theorem. */
  iqmp: bigint;
};

export type UserKey = Ed25519Key | EcdsaKey | RsaKey;

export type UserKeyType = UserKey['type'];

/** Each curve with the hash SSH signs with (RFC 5656 section 6.2.1) and its scalar size. */
const CURVES = {
  'ecdsa-sha2-nistp256': { name: 'nistp256', curve: p256, size: 32 },
  'ecdsa-sha2-nistp384': { name: 'nistp384', curve: p384, size: 48 },
  'ecdsa-sha2-nistp521': { name: 'nistp521', curve: p521, size: 66 },
} as const;

export const isEcdsaKeyType = (type: string): type is EcdsaKeyType => type in CURVES;

/** The app's own key type. */
export const USER_KEY_ALGORITHM = 'ssh-ed25519';

export function generateUserKey(): Ed25519Key {
  return userKeyFromSeed(randomBytes(32));
}

export function userKeyFromSeed(seed: Uint8Array): Ed25519Key {
  return { type: 'ssh-ed25519', seed, publicKey: ed25519.getPublicKey(seed) };
}

export function publicKeyBlob(key: UserKey): Uint8Array {
  const writer = new SshWriter().string(key.type);
  switch (key.type) {
    case 'ssh-ed25519':
      return writer.string(key.publicKey).toBytes();
    case 'ssh-rsa':
      return writer.mpint(bigIntToBytes(key.e)).mpint(bigIntToBytes(key.n)).toBytes();
    default:
      return writer.string(CURVES[key.type].name).string(key.publicKey).toBytes();
  }
}

/** The authorized_keys line, e.g. `ssh-ed25519 AAAAC3… flare-terminal`. */
export function publicKeyLine(key: UserKey, comment = 'flare-terminal'): string {
  return `${key.type} ${toBase64(publicKeyBlob(key))}${comment ? ` ${comment}` : ''}`;
}

/** What `ssh-keygen -l` calls it: "ED25519", "ECDSA 384", "RSA 4096". */
export function describeKey(key: UserKey): string {
  switch (key.type) {
    case 'ssh-ed25519':
      return 'ED25519';
    case 'ssh-rsa':
      return `RSA ${key.n.toString(2).length}`;
    default:
      return `ECDSA ${key.type.slice(-3)}`;
  }
}

/**
 * The signature algorithm to sign in with. Only RSA has a choice, made from what the host
 * said it accepts (`server-sig-algs`, RFC 8308; null when it didn't say), as OpenSSH does.
 * It signs with SHA-2, never SHA-1 (`ssh-rsa`): a host that only takes SHA-1 gets null, and
 * the key is skipped.
 */
export function signatureAlgorithm(key: UserKey, accepted: string[] | null): string | null {
  if (key.type !== 'ssh-rsa') return key.type;
  if (!accepted) return 'rsa-sha2-512';
  return (
    (['rsa-sha2-512', 'rsa-sha2-256'] as const).find((name) => accepted.includes(name)) ?? null
  );
}

/** An SSH signature blob over `data`. */
export function signWithUserKey(
  key: UserKey,
  data: Uint8Array,
  algorithm: string = key.type === 'ssh-rsa' ? 'rsa-sha2-512' : key.type
): Uint8Array {
  const writer = new SshWriter().string(algorithm);
  switch (key.type) {
    case 'ssh-ed25519':
      return writer.string(ed25519.sign(data, key.seed)).toBytes();
    case 'ssh-rsa':
      if (!isRsaSignatureAlgorithm(algorithm)) throw new Error(`Can't sign ${algorithm}`);
      return writer.string(signRsa(key, algorithm, data)).toBytes();
    default: {
      const { curve, size } = CURVES[key.type];
      // RFC 6979 nonces: no randomness to get wrong.
      const compact = curve.sign(data, key.privateKey, { prehash: true });
      const rs = new SshWriter()
        .mpint(compact.subarray(0, size))
        .mpint(compact.subarray(size))
        .toBytes();
      return writer.string(rs).toBytes();
    }
  }
}

/**
 * RSASSA-PKCS1-v1_5 with the Chinese remainder theorem. The message is blinded with a
 * random factor, so the time it takes doesn't depend on what is signed, and the result is
 * checked before it is sent: a miscalculated CRT signature would give the key away.
 */
function signRsa(key: RsaKey, algorithm: RsaSignatureAlgorithm, data: Uint8Array): Uint8Array {
  const { n, e, d, p, q, iqmp } = key;
  const size = byteLength(n);
  const m = bytesToBigInt(pkcs1Encode(algorithm, data, size));

  let r = 0n;
  while (r < 2n) r = bytesToBigInt(randomBytes(size)) % n;
  const blinded = (m * modPow(r, e, n)) % n;

  const m1 = modPow(blinded % p, d % (p - 1n), p);
  const m2 = modPow(blinded % q, d % (q - 1n), q);
  const h = (((m1 - m2) % p) + p) % p;
  const s = (m2 + ((h * iqmp) % p) * q) % n;
  const signature = (s * modInverse(r, n)) % n;

  if (modPow(signature, e, n) !== m) throw new Error('RSA signature check failed');
  return bigIntToBytes(signature, size);
}

/** Whether a signature from `signWithUserKey` checks out with the key's public half. */
function verifies(key: UserKey, data: Uint8Array, blob: Uint8Array): boolean {
  const reader = new SshReader(blob);
  const algorithm = reader.utf8();
  const signature = reader.string();
  switch (key.type) {
    case 'ssh-ed25519':
      return ed25519.verify(signature, data, key.publicKey);
    case 'ssh-rsa': {
      if (!isRsaSignatureAlgorithm(algorithm)) return false;
      const size = byteLength(key.n);
      const encoded = bigIntToBytes(modPow(bytesToBigInt(signature), key.e, key.n), size);
      return equalBytes(encoded, pkcs1Encode(algorithm, data, size));
    }
    default: {
      const { curve, size } = CURVES[key.type];
      const rs = new SshReader(signature);
      const compact = new Uint8Array(size * 2);
      compact.set(bigIntToBytes(bytesToBigInt(rs.mpint()), size), 0);
      compact.set(bigIntToBytes(bytesToBigInt(rs.mpint()), size), size);
      return curve.verify(compact, data, key.publicKey, { prehash: true });
    }
  }
}

/**
 * Whether a key's parts belong together: its public half is the one its private half
 * makes, and it signs. Catches damaged or tampered files before a host does.
 */
export function isConsistent(key: UserKey): boolean {
  try {
    switch (key.type) {
      case 'ssh-ed25519':
        if (!equalBytes(ed25519.getPublicKey(key.seed), key.publicKey)) return false;
        break;
      case 'ssh-rsa':
        // OpenSSH refuses RSA keys under 1024 bits.
        if (key.n.toString(2).length < 1024 || key.p * key.q !== key.n) return false;
        if ((key.iqmp * key.q) % key.p !== 1n) return false;
        break;
      default: {
        const { curve } = CURVES[key.type];
        if (!equalBytes(curve.getPublicKey(key.privateKey, false), key.publicKey)) return false;
      }
    }
    const probe = randomBytes(32);
    return verifies(key, probe, signWithUserKey(key, probe));
  } catch {
    return false;
  }
}

/**
 * A key's private fields as an OpenSSH key file lists them (PROTOCOL.key): how keys are
 * kept in the vault, and how private-key.ts reads them out of a file.
 */
export function writePrivateFields(key: UserKey): Uint8Array {
  const writer = new SshWriter().string(key.type);
  switch (key.type) {
    case 'ssh-ed25519': {
      const secret = new Uint8Array(64);
      secret.set(key.seed);
      secret.set(key.publicKey, 32);
      return writer.string(key.publicKey).string(secret).toBytes();
    }
    case 'ssh-rsa':
      for (const value of [key.n, key.e, key.d, key.iqmp, key.p, key.q]) {
        writer.mpint(bigIntToBytes(value));
      }
      return writer.toBytes();
    default:
      return writer
        .string(CURVES[key.type].name)
        .string(key.publicKey)
        .mpint(key.privateKey)
        .toBytes();
  }
}

export class UnsupportedKeyError extends Error {
  constructor(readonly keyType: string) {
    super(`Unsupported key type ${keyType}`);
  }
}

/** Reads the fields `writePrivateFields` writes. Throws on anything malformed. */
export function readPrivateFields(reader: SshReader): UserKey {
  const type = reader.utf8();
  if (type === 'ssh-ed25519') {
    const publicKey = reader.string();
    const secret = reader.string();
    if (publicKey.length !== 32 || secret.length !== 64) throw new Error('Malformed Ed25519 key');
    if (!equalBytes(secret.subarray(32), publicKey)) throw new Error('Malformed Ed25519 key');
    return { type, seed: secret.slice(0, 32), publicKey: publicKey.slice() };
  }
  if (type === 'ssh-rsa') {
    const [n, e, d, iqmp, p, q] = Array.from({ length: 6 }, () => bytesToBigInt(reader.mpint()));
    return { type, n, e, d, p, q, iqmp };
  }
  if (isEcdsaKeyType(type)) {
    const { name, size } = CURVES[type];
    if (reader.utf8() !== name) throw new Error('Malformed ECDSA key');
    const publicKey = reader.string().slice();
    const scalar = reader.mpint();
    if (scalar.length > size) throw new Error('Malformed ECDSA key');
    return { type, privateKey: bigIntToBytes(bytesToBigInt(scalar), size), publicKey };
  }
  throw new UnsupportedKeyError(type);
}
