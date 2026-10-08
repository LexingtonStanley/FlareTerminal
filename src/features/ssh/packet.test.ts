import { randomBytes } from '@noble/hashes/utils.js';

import { CIPHER_KEY_SIZES, createCipher, PacketReader, PacketWriter } from './packet';

const CIPHERS = Object.keys(CIPHER_KEY_SIZES);

function pair(name: string) {
  const { key, iv } = CIPHER_KEY_SIZES[name];
  const keyBytes = randomBytes(key);
  const ivBytes = randomBytes(iv);
  const writer = new PacketWriter();
  const reader = new PacketReader();
  writer.cipher = createCipher(name, keyBytes, ivBytes);
  reader.cipher = createCipher(name, keyBytes, ivBytes);
  return { writer, reader };
}

describe.each(CIPHERS)('%s packets', (name) => {
  it('round-trips payloads of every size, split at any point', () => {
    const { writer, reader } = pair(name);
    const payloads = [1, 2, 15, 16, 17, 100, 5000].map((size) => randomBytes(size));
    const wire = payloads.map((payload) => writer.frame(payload));
    const stream = new Uint8Array(wire.reduce((total, packet) => total + packet.length, 0));
    let offset = 0;
    wire.forEach((packet) => {
      stream.set(packet, offset);
      offset += packet.length;
    });

    const received: Uint8Array[] = [];
    for (let start = 0; start < stream.length; start += 7) {
      reader.push(stream.subarray(start, start + 7));
      for (let payload = reader.next(); payload; payload = reader.next()) received.push(payload);
    }
    expect(received).toEqual(payloads);
  });

  it('pads the encrypted part to the block size with at least 4 bytes', () => {
    const { writer } = pair(name);
    const { blockSize, tagLength } = writer.cipher;
    for (let size = 1; size < 40; size++) {
      const packet = writer.frame(new Uint8Array(size));
      expect((packet.length - 4 - tagLength) % blockSize).toBe(0);
      expect(packet.length - 4 - tagLength - 1 - size).toBeGreaterThanOrEqual(4);
    }
  });

  it.each([
    ['the length', 0],
    ['the payload', 6],
    ['the tag', -1],
  ])('rejects a packet with %s changed', (_part, index) => {
    const { writer, reader } = pair(name);
    const packet = writer.frame(new Uint8Array([94, 1, 2, 3]));
    packet[index < 0 ? packet.length + index : index] ^= 0x01;
    reader.push(packet);
    expect(() => reader.next()).toThrow();
  });

  it('rejects a packet replayed with the wrong sequence number', () => {
    const { writer, reader } = pair(name);
    const first = writer.frame(new Uint8Array([94, 1]));
    reader.push(first);
    expect(reader.next()).toEqual(new Uint8Array([94, 1]));
    reader.push(first);
    expect(() => reader.next()).toThrow();
  });
});

it('refuses absurd packet lengths before buffering them', () => {
  const reader = new PacketReader();
  reader.push(new Uint8Array([0x7f, 0xff, 0xff, 0xff, 0, 0, 0, 0]));
  expect(() => reader.next()).toThrow('Bad packet length');
});
