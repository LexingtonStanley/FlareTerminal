import { AbortError, bcryptPbkdf } from './bcrypt-pbkdf';

const bytes = (text: string) => new TextEncoder().encode(text);
const hex = (data: Uint8Array) => Buffer.from(data).toString('hex');

describe('bcryptPbkdf', () => {
  // From the bcrypt-pbkdf package (the port of OpenBSD's code that ssh2 and sshpk use).
  // The last two span two blocks, as aes256-ctr's and aes256-gcm's key and IV do.
  it.each([
    ['password', 'salt', 4, '5bbf0cc293587f1c3635555c27796598d47e579071bf427e9d8fbe842aba34d9'],
    [
      'correct horse battery staple',
      'NaCl and pepper!',
      16,
      'd3acd397d208781d5927e488c93d827b3faedc19e24b80a9f02296a3c9a493b61ea2c9054759f11af2c2cd8f50df7f78',
    ],
    [
      'p',
      's',
      2,
      '11f175a1d3d8a0197670cff4741d878b3dc50d10f81bc72d76d394ea00111f021c16dbb8bd8f84668157d80d',
    ],
  ])('derives the same bytes as OpenSSH for %j', async (passphrase, salt, rounds, expected) => {
    const key = await bcryptPbkdf(bytes(passphrase), bytes(salt), rounds, expected.length / 2);
    expect(hex(key)).toBe(expected);
  });

  it('reports each round as it goes', async () => {
    const progress: [number, number][] = [];
    await bcryptPbkdf(bytes('p'), bytes('s'), 3, 48, {
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(progress).toEqual([
      [1, 6],
      [2, 6],
      [3, 6],
      [4, 6],
      [5, 6],
      [6, 6],
    ]);
  });

  it('stops between rounds when aborted', async () => {
    const controller = new AbortController();
    const onProgress = jest.fn((done: number) => {
      if (done === 2) controller.abort();
    });

    await expect(
      bcryptPbkdf(bytes('p'), bytes('s'), 16, 48, { onProgress, signal: controller.signal })
    ).rejects.toThrow(AbortError);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('refuses parameters OpenSSH refuses', async () => {
    await expect(bcryptPbkdf(bytes(''), bytes('s'), 16, 48)).rejects.toThrow(RangeError);
    await expect(bcryptPbkdf(bytes('p'), bytes('s'), 0, 48)).rejects.toThrow(RangeError);
    await expect(bcryptPbkdf(bytes('p'), new Uint8Array(), 16, 48)).rejects.toThrow(RangeError);
  });
});
