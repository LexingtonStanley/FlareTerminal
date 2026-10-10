import { clearMemoryStorage } from '@/test-utils/memory-storage';

import type { SignRequest } from './agent';
import { createAppKey } from './app-key';
import { toBase64 } from './bytes';
import { forwardedAgent } from './forwarded-agent';
import type { KeyRequest } from './key-request';
import { describeSavedKey, storePrivateKey, writeImportedKeys } from './keys';
import { knownHosts } from './known-hosts';
import { generateUserKey, publicKeyBlob, publicKeyLine } from './user-key';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/lib/secrets', () => jest.requireActual('@/test-utils/memory-storage'));

beforeEach(() => clearMemoryStorage());

/** The app's key and an imported one, "Work" (its file's comment ada@laptop). */
function saveKeys() {
  const app = createAppKey();
  const work = generateUserKey();
  storePrivateKey('work', work);
  writeImportedKeys([describeSavedKey('work', 'Work', work, 'ada@laptop')]);
  return { app, work };
}

const signIn = (key: Uint8Array, hostKey: Uint8Array | null = null): SignRequest => ({
  key,
  purpose: { kind: 'sign-in', user: 'git', hostKey },
  through: [],
});

describe('forwardedAgent', () => {
  it('lists every key, the app’s first, with its file’s comment', () => {
    const { app, work } = saveKeys();
    const agent = forwardedAgent(async () => true);

    expect(agent.keys()).toEqual([
      { blob: publicKeyBlob(app), comment: 'flare-terminal' },
      { blob: publicKeyBlob(work), comment: 'ada@laptop' },
    ]);
  });

  it('asks about the key by name, and reads it from the vault once allowed', async () => {
    const { work } = saveKeys();
    const lexbox = publicKeyBlob(generateUserKey());
    knownHosts.trust('lexbox.tail.ts.net', 22, {
      type: 'ssh-ed25519',
      key: toBase64(lexbox),
      fingerprint: 'SHA256:lexbox',
      addedAt: '2026-10-10T00:00:00Z',
    });
    const asked: KeyRequest[] = [];
    const agent = forwardedAgent(async (request) => {
      asked.push(request);
      return true;
    });

    const key = await agent.approve(
      signIn(publicKeyBlob(work), lexbox),
      new AbortController().signal
    );

    expect(key && publicKeyLine(key)).toBe(publicKeyLine(work));
    expect(asked).toEqual([
      expect.objectContaining({
        key: expect.objectContaining({ id: 'work', name: 'Work' }),
        purpose: expect.objectContaining({
          host: { name: 'lexbox.tail.ts.net', fingerprint: expect.stringMatching(/^SHA256:/) },
        }),
      }),
    ]);
  });

  it('reads no key when the person denies, or the program stopped waiting', async () => {
    const { app } = saveKeys();
    const denied = forwardedAgent(async () => false);
    expect(await denied.approve(signIn(publicKeyBlob(app)), new AbortController().signal)).toBe(
      null
    );

    const controller = new AbortController();
    const late = forwardedAgent(async () => {
      controller.abort();
      return true;
    });
    expect(await late.approve(signIn(publicKeyBlob(app)), controller.signal)).toBe(null);
  });

  it('doesn’t ask about a key that’s gone', async () => {
    saveKeys();
    const ask = jest.fn(async () => true);
    const agent = forwardedAgent(ask);

    const gone = publicKeyBlob(generateUserKey());
    expect(await agent.approve(signIn(gone), new AbortController().signal)).toBe(null);
    expect(ask).not.toHaveBeenCalled();
  });
});
