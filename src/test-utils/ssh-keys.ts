// OpenSSH private key files for tests, written by the ssh2 package (an independent
// implementation of the format and of bcrypt_pbkdf), so no real key is ever checked in.
// Needs Node's crypto: use in Jest files marked `@jest-environment node`.
import { utils } from 'ssh2';

export type TestKeyType = 'ed25519' | 'ecdsa-256' | 'ecdsa-384' | 'ecdsa-521' | 'rsa';

const CURVE_BITS = { 'ecdsa-256': 256, 'ecdsa-384': 384, 'ecdsa-521': 521 } as const;

export type TestKeyOptions = {
  passphrase?: string;
  /** How the file is encrypted when there's a passphrase; aes256-ctr as ssh-keygen does. */
  cipher?: string;
  comment?: string;
  /** bcrypt rounds; low by default to keep tests fast (ssh-keygen uses 16). */
  rounds?: number;
};

/** A key pair: `private` is the OpenSSH key file, `public` the authorized_keys line. */
export function generateTestKey(type: TestKeyType, options: TestKeyOptions = {}) {
  const { passphrase, cipher = 'aes256-ctr', comment = '', rounds = 1 } = options;
  const extra = passphrase ? { comment, passphrase, cipher, rounds } : { comment };
  for (;;) {
    const keys =
      type === 'rsa'
        ? utils.generateKeyPairSync('rsa', { bits: 2048, ...extra })
        : type === 'ed25519'
          ? utils.generateKeyPairSync('ed25519', extra)
          : utils.generateKeyPairSync('ecdsa', { bits: CURVE_BITS[type], ...extra });
    // Now and then ssh2 drops an Ed25519 public key's leading zero byte and writes a broken
    // file (a 31-byte key). Real tools don't; generate again.
    if (type !== 'ed25519' || Buffer.from(keys.public.split(' ')[1], 'base64').length === 51) {
      return keys;
    }
  }
}
