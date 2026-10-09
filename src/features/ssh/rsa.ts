import { sha256, sha512 } from '@noble/hashes/sha2.js';

/** RSA arithmetic for SSH's rsa-sha2-256 and rsa-sha2-512 signatures (RFC 8332). */

export type RsaSignatureAlgorithm = 'rsa-sha2-512' | 'rsa-sha2-256';

// DER DigestInfo prefixes from RFC 8017 section 9.2, note 1.
const DIGEST_INFO: Record<
  RsaSignatureAlgorithm,
  { prefix: number[]; hash: (data: Uint8Array) => Uint8Array }
> = {
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

export const isRsaSignatureAlgorithm = (name: string): name is RsaSignatureAlgorithm =>
  name in DIGEST_INFO;

export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
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

/** x⁻¹ mod m, by the extended Euclidean algorithm; throws when there is none. */
export function modInverse(x: bigint, m: bigint): bigint {
  let [a, b] = [((x % m) + m) % m, m];
  let [u, v] = [1n, 0n];
  while (b !== 0n) {
    const q = a / b;
    [a, b] = [b, a - q * b];
    [u, v] = [v, u - q * v];
  }
  if (a !== 1n) throw new RangeError('Not invertible');
  return ((u % m) + m) % m;
}

/** The modulus' length in bytes: what every signature and encoding is padded to. */
export const byteLength = (n: bigint) => Math.ceil(n.toString(2).length / 8);

/** EMSA-PKCS1-v1_5 (RFC 8017 section 9.2): 00 01 FF..FF 00 DigestInfo hash, `size` bytes. */
export function pkcs1Encode(
  algorithm: RsaSignatureAlgorithm,
  data: Uint8Array,
  size: number
): Uint8Array {
  const info = DIGEST_INFO[algorithm];
  const digest = [...info.prefix, ...info.hash(data)];
  const encoded = new Uint8Array(size);
  encoded[1] = 0x01;
  encoded.fill(0xff, 2, size - digest.length - 1);
  encoded.set(digest, size - digest.length);
  return encoded;
}
