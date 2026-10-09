import { cbc, ctr, gcm } from '@noble/ciphers/aes.js';

import { AbortError, bcryptPbkdf, type BcryptOptions } from './bcrypt-pbkdf';
import { equalBytes, fromBase64, SshReader, utf8 } from './bytes';
import {
  isConsistent,
  publicKeyBlob,
  readPrivateFields,
  UnsupportedKeyError,
  type UserKey,
} from './user-key';

/**
 * Reads OpenSSH private key files (`-----BEGIN OPENSSH PRIVATE KEY-----`, PROTOCOL.key),
 * what `ssh-keygen` has written since OpenSSH 7.8, with or without a passphrase. Older PEM
 * files and PuTTY's .ppk get a message saying how to convert them. The passphrase is only
 * used here, to decrypt; nothing keeps it.
 */

export type ImportedKey = { key: UserKey; comment: string };

/** Why a key couldn't be read, and which field to show it under. */
export class KeyImportError extends Error {
  constructor(
    readonly field: 'key' | 'passphrase',
    message: string
  ) {
    super(message);
  }
}

const BEGIN = '-----BEGIN OPENSSH PRIVATE KEY-----';
const END = '-----END OPENSSH PRIVATE KEY-----';
const MAGIC = utf8('openssh-key-v1\0');
/** ssh-keygen uses 16 rounds unless told otherwise (`-a`); guides suggest up to 100. */
const MAX_ROUNDS = 1000;

type Cipher = {
  keyLength: number;
  ivLength: number;
  tagLength: number;
  decrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array, tag: Uint8Array): Uint8Array;
};

const aesCtr = (keyLength: number): Cipher => ({
  keyLength,
  ivLength: 16,
  tagLength: 0,
  decrypt: (key, iv, data) => ctr(key, iv).decrypt(data),
});
const aesCbc = (keyLength: number): Cipher => ({
  keyLength,
  ivLength: 16,
  tagLength: 0,
  decrypt: (key, iv, data) => cbc(key, iv, { disablePadding: true }).decrypt(data),
});
const aesGcm = (keyLength: number): Cipher => ({
  keyLength,
  ivLength: 12,
  tagLength: 16,
  decrypt: (key, iv, data, tag) => {
    const sealed = new Uint8Array(data.length + tag.length);
    sealed.set(data);
    sealed.set(tag, data.length);
    return gcm(key, iv).decrypt(sealed);
  },
});

/** What ssh-keygen encrypts keys with: aes256-ctr since 7.6, aes256-cbc before, any via -Z. */
const CIPHERS: Record<string, Cipher> = {
  'aes128-ctr': aesCtr(16),
  'aes192-ctr': aesCtr(24),
  'aes256-ctr': aesCtr(32),
  'aes128-cbc': aesCbc(16),
  'aes192-cbc': aesCbc(24),
  'aes256-cbc': aesCbc(32),
  'aes128-gcm@openssh.com': aesGcm(16),
  'aes256-gcm@openssh.com': aesGcm(32),
};

const SUPPORTED_TYPES = new Set<string>([
  'ssh-ed25519',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'ssh-rsa',
]);

type KeyFile = {
  cipher: string;
  kdf: string;
  kdfOptions: Uint8Array;
  publicKey: Uint8Array;
  sealed: Uint8Array;
  tag: Uint8Array;
};

/** A message for text that isn't an OpenSSH private key, naming what it is instead. */
function notOpenSsh(text: string): string {
  if (/-----BEGIN (RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(text)) {
    return 'This key is in the older PEM format. On your computer, run ssh-keygen -p -f <key file> to rewrite it in OpenSSH format (the key stays the same), then paste it again.';
  }
  if (/PuTTY-User-Key-File/.test(text)) {
    return 'This is a PuTTY key. In PuTTYgen, load it and choose Conversions › Export OpenSSH key (force new file format), then paste that.';
  }
  if (/^\s*(ssh-|ecdsa-|sk-)\S+ AAAA/.test(text)) {
    return 'That’s the public key. Paste the private key: the same file name without .pub.';
  }
  return 'Paste a private key that starts with -----BEGIN OPENSSH PRIVATE KEY-----.';
}

function readKeyFile(text: string): KeyFile {
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin < 0 || end < begin) throw new KeyImportError('key', notOpenSsh(text));
  const damaged = new KeyImportError('key', 'This key is incomplete or damaged. Copy it again.');

  let bytes: Uint8Array;
  try {
    bytes = fromBase64(text.slice(begin + BEGIN.length, end).replace(/\s+/g, ''));
  } catch {
    throw damaged;
  }
  if (!equalBytes(bytes.subarray(0, MAGIC.length), MAGIC)) throw damaged;
  try {
    const reader = new SshReader(bytes.subarray(MAGIC.length));
    const cipher = reader.utf8();
    const kdf = reader.utf8();
    const kdfOptions = reader.string();
    if (reader.uint32() !== 1) {
      throw new KeyImportError('key', 'This file holds several keys. Paste one key at a time.');
    }
    const publicKey = reader.string();
    const sealed = reader.string();
    const tag = reader.bytes(CIPHERS[cipher]?.tagLength ?? 0);
    return { cipher, kdf, kdfOptions, publicKey, sealed, tag };
  } catch (error) {
    if (error instanceof KeyImportError) throw error;
    throw damaged;
  }
}

/** Whether a pasted key needs its passphrase, or null when it isn't a key this can read. */
export function needsPassphrase(text: string): boolean | null {
  try {
    return readKeyFile(text).cipher !== 'none';
  } catch {
    return null;
  }
}

/**
 * Reads a private key, decrypting it with `passphrase` when it has one. `onProgress`
 * follows the (deliberately slow) passphrase check, which `signal` can stop. Throws a
 * KeyImportError that says what to do next, or an AbortError.
 */
export async function importPrivateKey(
  text: string,
  passphrase: string,
  options: BcryptOptions = {}
): Promise<ImportedKey> {
  const file = readKeyFile(text);
  // Say so before asking for a passphrase for a key that can't be used anyway.
  let type: string;
  try {
    type = new SshReader(file.publicKey).utf8();
  } catch {
    throw new KeyImportError('key', 'This key file is damaged.');
  }
  if (!SUPPORTED_TYPES.has(type)) throw unsupported(type);
  let plain: Uint8Array;

  if (file.cipher === 'none') {
    if (file.kdf !== 'none') throw new KeyImportError('key', 'This key file is damaged.');
    plain = file.sealed;
  } else {
    const cipher = CIPHERS[file.cipher];
    if (!cipher) {
      throw new KeyImportError(
        'key',
        `This key is encrypted with ${file.cipher}, which Flare can’t read. Run ssh-keygen -p -f <key file> -Z aes256-ctr to re-encrypt it.`
      );
    }
    if (file.kdf !== 'bcrypt' || file.sealed.length % 16) {
      throw new KeyImportError('key', 'This key file is damaged.');
    }
    if (!passphrase) throw new KeyImportError('passphrase', 'This key needs its passphrase');
    let salt: Uint8Array;
    let rounds: number;
    try {
      const options = new SshReader(file.kdfOptions);
      salt = options.string();
      rounds = options.uint32();
    } catch {
      throw new KeyImportError('key', 'This key file is damaged.');
    }
    if (rounds > MAX_ROUNDS) {
      throw new KeyImportError(
        'key',
        `This key’s passphrase takes ${rounds} rounds to check, too many for a phone. Run ssh-keygen -p -a 100 -f <key file> to lower it, then paste it again.`
      );
    }
    let derived: Uint8Array;
    try {
      derived = await bcryptPbkdf(
        utf8(passphrase),
        salt,
        rounds,
        cipher.keyLength + cipher.ivLength,
        options
      );
    } catch (error) {
      if (error instanceof AbortError) throw error;
      throw new KeyImportError('key', 'This key file is damaged.');
    }
    try {
      plain = cipher.decrypt(
        derived.subarray(0, cipher.keyLength),
        derived.subarray(cipher.keyLength),
        file.sealed,
        file.tag
      );
    } catch {
      // GCM's tag check fails on a wrong passphrase; the other modes fail on the check below.
      throw new KeyImportError('passphrase', 'Wrong passphrase');
    }
  }

  const reader = new SshReader(plain);
  let key: UserKey;
  let comment: string;
  try {
    // Two copies of the same random number: they only match when decryption worked.
    if (reader.uint32() !== reader.uint32()) {
      throw new KeyImportError('passphrase', 'Wrong passphrase');
    }
    key = readPrivateFields(reader);
    comment = reader.utf8();
    const padding = reader.rest();
    if (padding.some((byte, index) => byte !== index + 1)) throw new Error('Bad padding');
  } catch (error) {
    if (error instanceof KeyImportError) throw error;
    if (error instanceof UnsupportedKeyError) throw unsupported(error.keyType);
    throw new KeyImportError('key', 'This key file is damaged.');
  }

  if (!equalBytes(publicKeyBlob(key), file.publicKey) || !isConsistent(key)) {
    throw new KeyImportError('key', 'This key’s parts don’t match. The file may be damaged.');
  }
  return { key, comment };
}

function unsupported(keyType: string): KeyImportError {
  if (keyType.startsWith('sk-')) {
    return new KeyImportError(
      'key',
      'This key lives on a security key (FIDO), which Flare can’t use yet. Use an Ed25519, ECDSA or RSA key.'
    );
  }
  return new KeyImportError(
    'key',
    `Flare can’t use ${keyType} keys. Use an Ed25519, ECDSA or RSA key.`
  );
}
