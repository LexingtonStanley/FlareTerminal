/** SSH wire types (RFC 4251 section 5): byte, boolean, uint32, string, mpint, name-list. */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

export const utf8 = (text: string) => encoder.encode(text);
export const fromUtf8 = (bytes: Uint8Array) => decoder.decode(bytes);

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Constant-time comparison for MACs and keys. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Big-endian unsigned bytes to a BigInt. */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

/** A BigInt to big-endian unsigned bytes, left-padded to `length` when given. */
export function bigIntToBytes(value: bigint, length?: number): Uint8Array {
  const hex = value.toString(16);
  const digits = hex.length % 2 ? `0${hex}` : hex;
  const size = Math.max(length ?? 0, digits.length / 2);
  const out = new Uint8Array(size);
  for (let i = 0; i < digits.length / 2; i++) {
    out[size - digits.length / 2 + i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export class SshWriter {
  private buffer = new Uint8Array(256);
  private length = 0;

  private reserve(extra: number) {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  byte(value: number) {
    this.reserve(1);
    this.buffer[this.length++] = value & 0xff;
    return this;
  }

  boolean(value: boolean) {
    return this.byte(value ? 1 : 0);
  }

  uint32(value: number) {
    this.reserve(4);
    this.buffer[this.length++] = (value >>> 24) & 0xff;
    this.buffer[this.length++] = (value >>> 16) & 0xff;
    this.buffer[this.length++] = (value >>> 8) & 0xff;
    this.buffer[this.length++] = value & 0xff;
    return this;
  }

  raw(bytes: Uint8Array) {
    this.reserve(bytes.length);
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
    return this;
  }

  string(value: Uint8Array | string) {
    const bytes = typeof value === 'string' ? utf8(value) : value;
    return this.uint32(bytes.length).raw(bytes);
  }

  nameList(names: string[]) {
    return this.string(names.join(','));
  }

  /** An unsigned big-endian magnitude as an mpint: no leading zeros, sign bit clear. */
  mpint(magnitude: Uint8Array) {
    let start = 0;
    while (start < magnitude.length && magnitude[start] === 0) start++;
    const trimmed = magnitude.subarray(start);
    if (trimmed.length === 0) return this.uint32(0);
    const pad = trimmed[0] & 0x80 ? 1 : 0;
    this.uint32(trimmed.length + pad);
    if (pad) this.byte(0);
    return this.raw(trimmed);
  }

  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

export class SshReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  private take(count: number): Uint8Array {
    if (this.offset + count > this.data.length) throw new Error('SSH message is truncated');
    const out = this.data.subarray(this.offset, this.offset + count);
    this.offset += count;
    return out;
  }

  byte(): number {
    return this.take(1)[0];
  }

  bytes(count: number): Uint8Array {
    return this.take(count);
  }

  boolean(): boolean {
    return this.byte() !== 0;
  }

  uint32(): number {
    const b = this.take(4);
    return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  }

  string(): Uint8Array {
    return this.take(this.uint32());
  }

  utf8(): string {
    return fromUtf8(this.string());
  }

  nameList(): string[] {
    const text = this.utf8();
    return text ? text.split(',') : [];
  }

  /** An mpint as its unsigned magnitude (SSH only uses non-negative values here). */
  mpint(): Uint8Array {
    const bytes = this.string();
    if (bytes.length && bytes[0] & 0x80) throw new Error('Negative mpint');
    let start = 0;
    while (start < bytes.length && bytes[start] === 0) start++;
    return bytes.subarray(start);
  }

  rest(): Uint8Array {
    return this.take(this.data.length - this.offset);
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }
}
