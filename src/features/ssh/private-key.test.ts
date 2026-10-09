/**
 * @jest-environment node
 */
// Key files written by the ssh2 package (an independent implementation of OpenSSH's format
// and of bcrypt_pbkdf), read back by ours.
import { generateTestKey, type TestKeyType } from '@/test-utils/ssh-keys';

import { AbortError } from './bcrypt-pbkdf';
import { fromBase64, SshReader, SshWriter, toBase64 } from './bytes';
import { importPrivateKey, KeyImportError, needsPassphrase } from './private-key';
import { publicKeyLine, readPrivateFields, writePrivateFields } from './user-key';

const TYPES: TestKeyType[] = ['ed25519', 'ecdsa-256', 'ecdsa-384', 'ecdsa-521', 'rsa'];

/** What importing `text` fails with. */
async function importError(text: string, passphrase = '') {
  const error = await importPrivateKey(text, passphrase).catch((caught: unknown) => caught);
  if (!(error instanceof KeyImportError)) throw new Error(`Expected a KeyImportError: ${error}`);
  return { field: error.field, message: error.message };
}

describe('importPrivateKey', () => {
  it.each(TYPES)('reads a %s key and its comment', async (type) => {
    const file = generateTestKey(type, { comment: 'ada@laptop' });

    const { key, comment } = await importPrivateKey(file.private, '');

    expect(comment).toBe('ada@laptop');
    expect(publicKeyLine(key, comment)).toBe(file.public);
  });

  it.each(TYPES)('decrypts a %s key with its passphrase', async (type) => {
    const file = generateTestKey(type, { passphrase: 'correct horse', comment: 'ada' });
    expect(needsPassphrase(file.private)).toBe(true);

    const { key } = await importPrivateKey(file.private, 'correct horse');

    expect(publicKeyLine(key, 'ada')).toBe(file.public);
  });

  it.each(['aes256-cbc', 'aes128-ctr', 'aes256-gcm@openssh.com', 'aes128-gcm@openssh.com'])(
    'decrypts a key encrypted with %s',
    async (cipher) => {
      const file = generateTestKey('ed25519', { passphrase: 'pw', cipher });
      const { key } = await importPrivateKey(file.private, 'pw');
      expect(publicKeyLine(key, '')).toBe(file.public);
    }
  );

  it('follows the passphrase check round by round', async () => {
    const file = generateTestKey('ed25519', { passphrase: 'pw', rounds: 3 });
    const progress = jest.fn();

    await importPrivateKey(file.private, 'pw', { onProgress: progress });

    // aes256-ctr needs 48 bytes: two blocks of three rounds.
    expect(progress).toHaveBeenLastCalledWith(6, 6);
  });

  it('stops checking the passphrase when aborted', async () => {
    const file = generateTestKey('ed25519', { passphrase: 'pw', rounds: 3 });
    const controller = new AbortController();
    controller.abort();

    await expect(
      importPrivateKey(file.private, 'pw', { signal: controller.signal })
    ).rejects.toThrow(AbortError);
  });

  it.each(['aes256-ctr', 'aes256-gcm@openssh.com'])(
    'says when the passphrase is wrong or missing (%s)',
    async (cipher) => {
      const file = generateTestKey('ed25519', { passphrase: 'right', cipher });

      expect(await importError(file.private, 'wrong')).toEqual({
        field: 'passphrase',
        message: 'Wrong passphrase',
      });
      expect(await importError(file.private)).toEqual({
        field: 'passphrase',
        message: 'This key needs its passphrase',
      });
    }
  );

  it('ignores a passphrase given for a key without one', async () => {
    const file = generateTestKey('ed25519');
    expect(needsPassphrase(file.private)).toBe(false);
    await expect(importPrivateKey(file.private, 'unused')).resolves.toBeTruthy();
  });

  it('reads a key pasted with extra spaces and Windows line ends', async () => {
    const file = generateTestKey('ecdsa-256');
    const pasted = `\n  ${file.private.replace(/\n/g, '\r\n  ')}\n`;
    await expect(importPrivateKey(pasted, '')).resolves.toBeTruthy();
  });

  it.each([
    ['-----BEGIN RSA PRIVATE KEY-----\nMIIE…\n-----END RSA PRIVATE KEY-----', /ssh-keygen -p/],
    ['-----BEGIN PRIVATE KEY-----\nMIIE…\n-----END PRIVATE KEY-----', /older PEM format/],
    ['PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: none', /PuTTYgen/],
    ['ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM2 ada@laptop', /That’s the public key/],
    ['hello', /BEGIN OPENSSH PRIVATE KEY/],
  ])('explains what to do with %j', async (text, message) => {
    expect(needsPassphrase(text)).toBeNull();
    const error = await importError(text);
    expect(error.field).toBe('key');
    expect(error.message).toMatch(message);
  });

  it.each([
    ['ssh-dss', 'Flare can’t use ssh-dss keys. Use an Ed25519, ECDSA or RSA key.'],
    ['sk-ssh-ed25519@openssh.com', /security key \(FIDO\)/],
  ])('names a key type it can’t use: %s', async (type, message) => {
    const publicKey = new SshWriter().string(type).string(new Uint8Array(32)).toBytes();
    const file = new SshWriter()
      .raw(new TextEncoder().encode('openssh-key-v1\0'))
      .string('aes256-ctr')
      .string('bcrypt')
      .string(new SshWriter().string(new Uint8Array(16)).uint32(16).toBytes())
      .uint32(1)
      .string(publicKey)
      .string(new Uint8Array(64))
      .toBytes();
    const text = `-----BEGIN OPENSSH PRIVATE KEY-----\n${toBase64(file)}\n-----END OPENSSH PRIVATE KEY-----`;

    // Before any passphrase is asked for.
    const error = await importError(text);
    expect(error.field).toBe('key');
    expect(error.message).toMatch(message);
  });

  it('refuses a damaged key', async () => {
    const { private: text } = generateTestKey('ed25519');
    const lines = text.trim().split('\n');
    const cut = [...lines.slice(0, 2), lines.at(-1)].join('\n');

    expect(await importError(cut)).toEqual({
      field: 'key',
      message: 'This key is incomplete or damaged. Copy it again.',
    });
  });

  it('refuses a file whose public key isn’t its private key’s', async () => {
    const a = generateTestKey('ed25519');
    const b = generateTestKey('ed25519');
    const blobOf = (line: string) => fromBase64(line.split(' ')[1]);
    const body = (text: string) => text.split('\n').slice(1, -2).join('');
    const bytes = fromBase64(body(a.private));
    const at = Buffer.from(bytes).indexOf(Buffer.from(blobOf(a.public)));
    bytes.set(blobOf(b.public), at);
    const swapped = `-----BEGIN OPENSSH PRIVATE KEY-----\n${toBase64(bytes)}\n-----END OPENSSH PRIVATE KEY-----\n`;

    expect(await importError(swapped)).toEqual({
      field: 'key',
      message: 'This key’s parts don’t match. The file may be damaged.',
    });
  });
});

describe('private fields', () => {
  it.each(TYPES)('round-trip a %s key, as the vault keeps it', async (type) => {
    const { key } = await importPrivateKey(generateTestKey(type).private, '');
    expect(readPrivateFields(new SshReader(writePrivateFields(key)))).toEqual(key);
  });
});
