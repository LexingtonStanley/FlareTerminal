import { setVaultKey } from './vault-key';
import { getSecret, resealSecrets, setSecret } from './secrets';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItem: (key: string) => mockKeychain.get(key) ?? null,
  setItem: (key: string, value: string) => mockKeychain.set(key, value),
  deleteItemAsync: async (key: string) => mockKeychain.delete(key),
}));

const KEY = new Uint8Array(32).fill(7);

beforeEach(() => {
  mockKeychain.clear();
  setVaultKey(null);
});

describe('secrets', () => {
  it('stores secrets as given while there is no vault key', () => {
    setSecret('connection.a.password', 'hunter2');
    expect(mockKeychain.get('flare.connection.a.password')).toBe('hunter2');
    expect(getSecret('connection.a.password')).toBe('hunter2');
  });

  it('reseals every secret when the vault key changes, including ones saved earlier', () => {
    setSecret('connection.a.password', 'hunter2');
    mockKeychain.set('flare.ssh.app-key.ed25519', 'seed'); // saved before names were recorded

    resealSecrets(() => setVaultKey(KEY), ['ssh.app-key.ed25519']);
    expect(mockKeychain.get('flare.connection.a.password')).toMatch(/^fv1:/);
    expect(mockKeychain.get('flare.ssh.app-key.ed25519')).toMatch(/^fv1:/);
    expect(getSecret('ssh.app-key.ed25519')).toBe('seed');

    setVaultKey(null);
    expect(getSecret('connection.a.password')).toBeNull();

    setVaultKey(KEY);
    resealSecrets(() => setVaultKey(null));
    expect(mockKeychain.get('flare.connection.a.password')).toBe('hunter2');
  });

  it('forgets a deleted secret', () => {
    setSecret('connection.a.password', 'hunter2');
    setSecret('connection.a.password', null);
    expect(getSecret('connection.a.password')).toBeNull();
  });
});
