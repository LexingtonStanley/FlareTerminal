import { ed25519 } from '@noble/curves/ed25519.js';
import { p256 } from '@noble/curves/nist.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';

import { bigIntToBytes, bytesToBigInt, equalBytes, SshReader, toBase64 } from './bytes';

/** A server's public host key: its SSH wire blob and what it is. */
export type HostKey = {
  /** Key type in the blob: ssh-ed25519, ecdsa-sha2-nistp256 or ssh-rsa. */
  type: string;
  blob: Uint8Array;
};

/** OpenSSH's fingerprint format: `SHA256:` and unpadded base64 of the blob's SHA-256. */
export function fingerprint(blob: Uint8Array): string {
  return `SHA256:${toBase64(sha256(blob)).replace(/=+$/, '')}`;
}

export function parseHostKey(blob: Uint8Array): HostKey {
  return { type: new SshReader(blob).utf8(), blob };
}

/** The key type a host key algorithm uses (rsa-sha2-* signatures use ssh-rsa keys). */
export function keyTypeFor(algorithm: string): string {
  return algorithm.startsWith('rsa-sha2-') ? 'ssh-rsa' : algorithm;
}

// DER DigestInfo prefixes from RFC 8017 section 9.2, note 1.
const DIGEST_INFO: Record<string, { prefix: number[]; hash: (data: Uint8Array) => Uint8Array }> = {
  'rsa-sha2-256': {
    prefix: [
      0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
      0x05, 0x00, 0x04, 0x20,
    ],
    hash: sha256,
  },
  'rsa-sha2-512': {
    prefix: [
      0x30, 0x51, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03,
      0x05, 0x00, 0x04, 0x40,
    ],
    hash: sha512,
  },
};

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

function verifyRsa(algorithm: string, key: SshReader, signature: Uint8Array, data: Uint8Array) {
  const info = DIGEST_INFO[algorithm];
  if (!info) return false;
  const e = bytesToBigInt(key.mpint());
  const nBytes = key.mpint();
  const n = bytesToBigInt(nBytes);
  // OpenSSH refuses RSA keys under 1024 bits.
  if (nBytes.length * 8 < 1024 || signature.length > nBytes.length) return false;

  const s = bytesToBigInt(signature);
  if (s >= n) return false;
  const encoded = bigIntToBytes(modPow(s, e, n), nBytes.length);

  // EMSA-PKCS1-v1_5: 00 01 FF..FF 00 DigestInfo hash, compared in full.
  const digest = [...info.prefix, ...info.hash(data)];
  const expected = new Uint8Array(nBytes.length);
  expected[1] = 0x01;
  expected.fill(0xff, 2, nBytes.length - digest.length - 1);
  expected.set(digest, nBytes.length - digest.length);
  return equalBytes(encoded, expected);
}

/**
 * Checks the server's signature over the exchange hash. `algorithm` is the negotiated
 * host key algorithm; the signature must use exactly that algorithm.
 */
export function verifyHostSignature(
  algorithm: string,
  hostKey: HostKey,
  signatureBlob: Uint8Array,
  data: Uint8Array
): boolean {
  if (hostKey.type !== keyTypeFor(algorithm)) return false;
  const sig = new SshReader(signatureBlob);
  if (sig.utf8() !== algorithm) return false;
  const signature = sig.string();

  const key = new SshReader(hostKey.blob);
  key.utf8();
  try {
    switch (algorithm) {
      case 'ssh-ed25519':
        return ed25519.verify(signature, data, key.string());
      case 'ecdsa-sha2-nistp256': {
        if (key.utf8() !== 'nistp256') return false;
        const point = key.string();
        const rs = new SshReader(signature);
        const compact = new Uint8Array(64);
        compact.set(bigIntToBytes(bytesToBigInt(rs.mpint()), 32), 0);
        compact.set(bigIntToBytes(bytesToBigInt(rs.mpint()), 32), 32);
        // SSH hashes with SHA-256 and allows high-S signatures.
        return p256.verify(compact, data, point, { prehash: true, lowS: false });
      }
      case 'rsa-sha2-256':
      case 'rsa-sha2-512':
        return verifyRsa(algorithm, key, signature, data);
      default:
        return false;
    }
  } catch {
    return false;
  }
}
