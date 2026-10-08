import { gcm } from '@noble/ciphers/aes.js';
import { chacha20orig } from '@noble/ciphers/chacha.js';
import { poly1305 } from '@noble/ciphers/_poly1305.js';
import { randomBytes } from '@noble/hashes/utils.js';

import { concatBytes, equalBytes } from './bytes';
import { MAX_PACKET_LENGTH } from './constants';

/**
 * The binary packet protocol (RFC 4253 section 6): length, padding length, payload,
 * random padding, then the AEAD tag. Before the first key exchange packets travel in
 * the clear; afterwards with chacha20-poly1305@openssh.com or aes-gcm@openssh.com.
 */

export interface PacketCipher {
  readonly name: string;
  readonly blockSize: number;
  /** AEAD modes leave the 4-byte length out of the padding alignment. */
  readonly aead: boolean;
  readonly tagLength: number;
  /** Encrypts a whole packet (length field included) and appends the tag. */
  seal(seq: number, packet: Uint8Array): Uint8Array;
  /** The packet length from the first 4 received bytes. */
  readLength(seq: number, head: Uint8Array): number;
  /** Authenticates and decrypts; returns the bytes after the length field. Throws if forged. */
  open(seq: number, packet: Uint8Array): Uint8Array;
}

function readUint32(bytes: Uint8Array, offset = 0) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function seqNonce(seq: number): Uint8Array {
  const nonce = new Uint8Array(8);
  new DataView(nonce.buffer).setUint32(4, seq);
  return nonce;
}

export const plaintextCipher: PacketCipher = {
  name: 'none',
  blockSize: 8,
  aead: false,
  tagLength: 0,
  seal: (_seq, packet) => packet,
  readLength: (_seq, head) => readUint32(head),
  open: (_seq, packet) => packet.subarray(4),
};

/** OpenSSH's PROTOCOL.chacha20poly1305: 64 key bytes, K_2 (payload) then K_1 (length). */
export function chacha20Poly1305(key: Uint8Array): PacketCipher {
  const mainKey = key.subarray(0, 32);
  const lengthKey = key.subarray(32, 64);

  function polyKey(nonce: Uint8Array) {
    return chacha20orig(mainKey, nonce, new Uint8Array(32), undefined, 0);
  }

  return {
    name: 'chacha20-poly1305@openssh.com',
    blockSize: 8,
    aead: true,
    tagLength: 16,
    seal(seq, packet) {
      const nonce = seqNonce(seq);
      const length = chacha20orig(lengthKey, nonce, packet.subarray(0, 4), undefined, 0);
      const body = chacha20orig(mainKey, nonce, packet.subarray(4), undefined, 1);
      const encrypted = concatBytes(length, body);
      return concatBytes(encrypted, poly1305(encrypted, polyKey(nonce)));
    },
    readLength(seq, head) {
      return readUint32(chacha20orig(lengthKey, seqNonce(seq), head.subarray(0, 4), undefined, 0));
    },
    open(seq, packet) {
      const nonce = seqNonce(seq);
      const encrypted = packet.subarray(0, packet.length - 16);
      const tag = packet.subarray(packet.length - 16);
      if (!equalBytes(poly1305(encrypted, polyKey(nonce)), tag)) {
        throw new Error('Packet authentication failed');
      }
      return chacha20orig(mainKey, nonce, encrypted.subarray(4), undefined, 1);
    },
  };
}

/** RFC 5647 as OpenSSH implements it: 12-byte IV whose last 8 bytes count packets. */
export function aesGcm(name: string, key: Uint8Array, iv: Uint8Array): PacketCipher {
  const nonce = iv.slice(0, 12);

  function nextNonce() {
    const current = nonce.slice();
    // Increment the 64-bit invocation counter (bytes 4..11), big-endian.
    for (let i = 11; i >= 4; i--) {
      nonce[i] = (nonce[i] + 1) & 0xff;
      if (nonce[i] !== 0) break;
    }
    return current;
  }

  return {
    name,
    blockSize: 16,
    aead: true,
    tagLength: 16,
    seal(_seq, packet) {
      const aad = packet.subarray(0, 4);
      return concatBytes(aad, gcm(key, nextNonce(), aad).encrypt(packet.subarray(4)));
    },
    readLength: (_seq, head) => readUint32(head),
    open(_seq, packet) {
      const aad = packet.subarray(0, 4);
      try {
        return gcm(key, nextNonce(), aad).decrypt(packet.subarray(4));
      } catch {
        throw new Error('Packet authentication failed');
      }
    },
  };
}

export const CIPHER_KEY_SIZES: Record<string, { key: number; iv: number }> = {
  'chacha20-poly1305@openssh.com': { key: 64, iv: 0 },
  'aes256-gcm@openssh.com': { key: 32, iv: 12 },
  'aes128-gcm@openssh.com': { key: 16, iv: 12 },
};

export function createCipher(name: string, key: Uint8Array, iv: Uint8Array): PacketCipher {
  if (name === 'chacha20-poly1305@openssh.com') return chacha20Poly1305(key);
  if (name === 'aes256-gcm@openssh.com' || name === 'aes128-gcm@openssh.com') {
    return aesGcm(name, key, iv);
  }
  throw new Error(`Unsupported cipher ${name}`);
}

/** Frames payloads into packets for one direction. */
export class PacketWriter {
  cipher: PacketCipher = plaintextCipher;
  seq = 0;

  frame(payload: Uint8Array): Uint8Array {
    const { blockSize, aead } = this.cipher;
    // Everything after the length field (aead) or the whole packet must align to the block.
    const unpadded = 1 + payload.length + (aead ? 0 : 4);
    let padding = blockSize - (unpadded % blockSize);
    if (padding < 4) padding += blockSize;

    const packet = new Uint8Array(4 + 1 + payload.length + padding);
    new DataView(packet.buffer).setUint32(0, 1 + payload.length + padding);
    packet[4] = padding;
    packet.set(payload, 5);
    packet.set(randomBytes(padding), 5 + payload.length);

    const sealed = this.cipher.seal(this.seq, packet);
    this.seq = (this.seq + 1) >>> 0;
    return sealed;
  }
}

/** Collects received bytes and yields whole, authenticated payloads. */
export class PacketReader {
  cipher: PacketCipher = plaintextCipher;
  seq = 0;
  private buffer: Uint8Array = new Uint8Array(0);
  private pendingLength: number | null = null;

  push(bytes: Uint8Array) {
    this.buffer = this.buffer.length ? concatBytes(this.buffer, bytes) : bytes.slice();
  }

  /** The next payload, or null until more bytes arrive. Throws on corrupt or forged data. */
  next(): Uint8Array | null {
    if (this.pendingLength === null) {
      if (this.buffer.length < 4) return null;
      const length = this.cipher.readLength(this.seq, this.buffer);
      if (length < 5 || length > MAX_PACKET_LENGTH) throw new Error('Bad packet length');
      this.pendingLength = length;
    }
    const total = 4 + this.pendingLength + this.cipher.tagLength;
    if (this.buffer.length < total) return null;

    const packet = this.buffer.subarray(0, total);
    const body = this.cipher.open(this.seq, packet);
    this.buffer = this.buffer.subarray(total);
    this.pendingLength = null;
    this.seq = (this.seq + 1) >>> 0;

    const padding = body[0];
    if (padding < 4 || padding + 1 > body.length) throw new Error('Bad packet padding');
    return body.slice(1, body.length - padding);
  }
}
