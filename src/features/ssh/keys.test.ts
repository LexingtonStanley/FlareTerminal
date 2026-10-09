import { clearMemoryStorage } from '@/test-utils/memory-storage';

import { createAppKey } from './app-key';
import {
  APP_KEY_ID,
  authorizeCommand,
  describeSavedKey,
  keysForConnection,
  NO_KEY,
  storePrivateKey,
  writeImportedKeys,
} from './keys';
import { generateUserKey, publicKeyLine, type UserKey } from './user-key';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/lib/secrets', () => jest.requireActual('@/test-utils/memory-storage'));

beforeEach(() => clearMemoryStorage());

function imported(id: string): UserKey {
  const key = generateUserKey();
  storePrivateKey(id, key);
  return key;
}

const lines = (keys: UserKey[]) => keys.map((key) => publicKeyLine(key));

describe('keysForConnection', () => {
  it('offers every key, the app’s first, when none is chosen', () => {
    const work = imported('work');
    const home = imported('home');
    writeImportedKeys([
      describeSavedKey('work', 'Work', work),
      describeSavedKey('home', 'Home', home),
    ]);
    const app = createAppKey();

    expect(lines(keysForConnection(undefined))).toEqual(lines([app, work, home]));
    expect(lines(keysForConnection(null))).toEqual(lines([app, work, home]));
  });

  it('offers only the chosen key, or none', () => {
    const work = imported('work');
    writeImportedKeys([describeSavedKey('work', 'Work', work)]);
    const app = createAppKey();

    expect(lines(keysForConnection('work'))).toEqual(lines([work]));
    expect(lines(keysForConnection(APP_KEY_ID))).toEqual(lines([app]));
    expect(keysForConnection(NO_KEY)).toEqual([]);
  });

  it('falls back to every key when the chosen one was deleted', () => {
    const work = imported('work');
    writeImportedKeys([describeSavedKey('work', 'Work', work)]);

    expect(lines(keysForConnection('gone'))).toEqual(lines([work]));
    expect(lines(keysForConnection(APP_KEY_ID))).toEqual(lines([work]));
  });
});

describe('describeSavedKey', () => {
  it('keeps a key file’s comment on one authorized_keys line', () => {
    const saved = describeSavedKey('k', 'Key', generateUserKey(), 'ada@laptop\nrm -rf ~');
    expect(saved.publicKey).toMatch(/^ssh-ed25519 AAAA\S+ ada@laptop rm -rf ~$/);
    expect(saved.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    expect(saved.kind).toBe('ED25519');
  });
});

describe('authorizeCommand', () => {
  it('quotes the line for the shell', () => {
    expect(authorizeCommand("ssh-ed25519 AAAAC3 ada's laptop")).toBe(
      "mkdir -p ~/.ssh && echo 'ssh-ed25519 AAAAC3 ada'\\''s laptop' >> ~/.ssh/authorized_keys"
    );
  });
});
