/**
 * @jest-environment node
 */
// Signatures checked by Node's crypto (OpenSSL), not by our own code.
import { createPublicKey, verify } from 'node:crypto';
import { utils } from 'ssh2';

import { generateTestKey, type TestKeyType } from '@/test-utils/ssh-keys';

import { bigIntToBytes, bytesToBigInt, SshReader } from './bytes';
import { importPrivateKey } from './private-key';
import {
  describeKey,
  generateUserKey,
  isConsistent,
  signatureAlgorithm,
  signWithUserKey,
  type UserKey,
} from './user-key';

async function testKey(type: TestKeyType) {
  const file = generateTestKey(type);
  const parsed = utils.parseKey(file.public);
  if (parsed instanceof Error) throw parsed;
  const { key } = await importPrivateKey(file.private, '');
  return { key, publicKey: createPublicKey(parsed.getPublicPEM()) };
}

/** The signature inside an SSH signature blob, as OpenSSL wants it. */
function rawSignature(blob: Uint8Array, size: number): { algorithm: string; signature: Buffer } {
  const reader = new SshReader(blob);
  const algorithm = reader.utf8();
  const signature = reader.string();
  if (!algorithm.startsWith('ecdsa-')) return { algorithm, signature: Buffer.from(signature) };
  // ECDSA's r and s are mpints in SSH, fixed-size halves for OpenSSL's IEEE P1363 form.
  const rs = new SshReader(signature);
  const r = bigIntToBytes(bytesToBigInt(rs.mpint()), size);
  const s = bigIntToBytes(bytesToBigInt(rs.mpint()), size);
  return { algorithm, signature: Buffer.concat([r, s]) };
}

const data = new TextEncoder().encode('session id and userauth request');

describe('signWithUserKey', () => {
  it.each([
    ['ed25519', 'ssh-ed25519', null, 0],
    ['ecdsa-256', 'ecdsa-sha2-nistp256', 'sha256', 32],
    ['ecdsa-384', 'ecdsa-sha2-nistp384', 'sha384', 48],
    ['ecdsa-521', 'ecdsa-sha2-nistp521', 'sha512', 66],
    ['rsa', 'rsa-sha2-512', 'sha512', 0],
    ['rsa', 'rsa-sha2-256', 'sha256', 0],
  ] as const)('signs with a %s key as %s', async (type, algorithm, hash, size) => {
    const { key, publicKey } = await testKey(type);

    const blob = signWithUserKey(key, data, algorithm);

    const raw = rawSignature(blob, size);
    expect(raw.algorithm).toBe(algorithm);
    const options = size ? { key: publicKey, dsaEncoding: 'ieee-p1363' as const } : publicKey;
    expect(verify(hash, data, options, raw.signature)).toBe(true);
  });

  it('pads an RSA signature to the modulus’ length', async () => {
    const { key } = await testKey('rsa');
    for (let i = 0; i < 8; i++) {
      const { signature } = rawSignature(signWithUserKey(key, new Uint8Array([i])), 0);
      expect(signature).toHaveLength(256);
    }
  });
});

describe('signatureAlgorithm', () => {
  const ed25519 = generateUserKey();
  const rsa = { type: 'ssh-rsa' } as UserKey;

  it('uses SHA-512 for RSA unless the host only takes SHA-256, and never SHA-1', () => {
    expect(signatureAlgorithm(rsa, null)).toBe('rsa-sha2-512');
    expect(signatureAlgorithm(rsa, ['ssh-ed25519', 'rsa-sha2-256', 'rsa-sha2-512'])).toBe(
      'rsa-sha2-512'
    );
    expect(signatureAlgorithm(rsa, ['rsa-sha2-256', 'ssh-rsa'])).toBe('rsa-sha2-256');
    expect(signatureAlgorithm(rsa, ['ssh-rsa'])).toBeNull();
  });

  it('offers other keys whatever the host lists, as OpenSSH does', () => {
    expect(signatureAlgorithm(ed25519, null)).toBe('ssh-ed25519');
    expect(signatureAlgorithm(ed25519, ['rsa-sha2-512'])).toBe('ssh-ed25519');
  });
});

describe('isConsistent and describeKey', () => {
  it.each([
    ['ed25519', 'ED25519'],
    ['ecdsa-384', 'ECDSA 384'],
    ['rsa', 'RSA 2048'],
  ] as const)('accepts a whole %s key and names it', async (type, description) => {
    const { key } = await testKey(type);
    expect(isConsistent(key)).toBe(true);
    expect(describeKey(key)).toBe(description);
  });

  it('refuses keys whose halves don’t belong together', async () => {
    const ed = generateUserKey();
    expect(isConsistent({ ...ed, publicKey: generateUserKey().publicKey })).toBe(false);

    const { key: ec } = await testKey('ecdsa-256');
    const { key: other } = await testKey('ecdsa-256');
    if (ec.type !== 'ecdsa-sha2-nistp256' || other.type !== ec.type) throw new Error('ECDSA');
    expect(isConsistent({ ...ec, publicKey: other.publicKey })).toBe(false);

    const { key: rsa } = await testKey('rsa');
    if (rsa.type !== 'ssh-rsa') throw new Error('RSA');
    expect(isConsistent({ ...rsa, d: rsa.d + 2n })).toBe(false);
    expect(isConsistent({ ...rsa, iqmp: rsa.iqmp + 1n })).toBe(false);
  });
});
