import { biometrics, clearMemoryStorage } from '@/test-utils/memory-storage';
import { openSecret, sealSecret } from '@/lib/vault-key';

import { FREE_ATTEMPTS, validateLockSecret, Vault } from './vault';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/lib/secrets', () => jest.requireActual('@/test-utils/memory-storage'));

const COST = { N: 2 ** 10, r: 8, p: 1 };
let time = 1_000_000;
const vault = (options = {}) => new Vault({ cost: COST, now: () => time, ...options });

beforeEach(() => {
  clearMemoryStorage();
  vault().close();
});

describe('Vault', () => {
  it('has no lock until one is set, and stores secrets as given', () => {
    expect(vault().settings()).toBeNull();
    expect(sealSecret('hunter2')).toBe('hunter2');
  });

  it('seals secrets once a lock is set, and opens them only after an unlock', async () => {
    const first = vault();
    await first.create('pin', '123456');
    expect(first.settings()).toEqual({ kind: 'pin', biometrics: false, autoLock: 60 });

    const sealed = sealSecret('hunter2');
    expect(sealed).toMatch(/^fv1:/);
    expect(sealed).not.toContain('hunter2');
    expect(openSecret(sealed)).toBe('hunter2');

    // The app restarts: the key is gone until the PIN is entered.
    first.close();
    expect(openSecret(sealed)).toBeNull();
    const next = vault();
    expect(next.isOpen()).toBe(false);
    expect(await next.unlock('654321')).toEqual({ ok: false, retryAt: null });
    expect(openSecret(sealed)).toBeNull();
    expect(await next.unlock('123456')).toEqual({ ok: true });
    expect(openSecret(sealed)).toBe('hunter2');
  });

  it('re-checks the PIN while open without opening it again', async () => {
    const v = vault();
    await v.create('password', 'correct horse');
    expect(await v.unlock('correct horse')).toEqual({ ok: true });
    expect(await v.unlock('wrong horse')).toMatchObject({ ok: false });
    expect(v.isOpen()).toBe(true);
  });

  it('makes each guess after the free ones wait twice as long', async () => {
    const v = vault();
    await v.create('pin', '123456');
    v.close();
    for (let i = 1; i < FREE_ATTEMPTS; i++) {
      expect(await v.unlock('000000')).toEqual({ ok: false, retryAt: null });
    }
    expect(await v.unlock('000000')).toEqual({ ok: false, retryAt: time + 30_000 });
    // Even the right PIN waits.
    expect(await v.unlock('123456')).toEqual({ ok: false, retryAt: time + 30_000 });
    time += 30_000;
    expect(await v.unlock('000000')).toEqual({ ok: false, retryAt: time + 60_000 });
    time += 60_000;
    expect(await v.unlock('123456')).toEqual({ ok: true });
    expect(v.retryAt()).toBeNull();
  });

  it('keeps the same secrets across a change of PIN', async () => {
    const v = vault();
    await v.create('pin', '123456');
    const sealed = sealSecret('hunter2');
    await v.change('password', 'a long password');
    v.close();

    const next = vault();
    expect(await next.unlock('123456')).toMatchObject({ ok: false });
    expect(await next.unlock('a long password')).toEqual({ ok: true });
    expect(next.settings()?.kind).toBe('password');
    expect(openSecret(sealed)).toBe('hunter2');
  });

  it('opens with biometrics once they are turned on', async () => {
    biometrics.supported = true;
    const v = vault();
    await v.create('pin', '123456');
    expect(await v.unlockWithBiometrics('Unlock Flare')).toBe(false);
    await v.setBiometrics(true);
    const sealed = sealSecret('hunter2');
    v.close();

    biometrics.approve = false;
    expect(await vault().unlockWithBiometrics('Unlock Flare')).toBe(false);
    expect(openSecret(sealed)).toBeNull();
    biometrics.approve = true;
    expect(await vault().unlockWithBiometrics('Unlock Flare')).toBe(true);
    expect(openSecret(sealed)).toBe('hunter2');
    expect(biometrics.prompts).toEqual(['Unlock Flare', 'Unlock Flare']);
  });

  it('stores secrets as given again once the lock is removed', async () => {
    const v = vault();
    await v.create('pin', '123456');
    await v.remove();
    expect(v.settings()).toBeNull();
    expect(sealSecret('hunter2')).toBe('hunter2');
    expect(await vault().unlock('anything')).toEqual({ ok: true });
  });
});

describe('validateLockSecret', () => {
  it('wants six digits for a PIN and eight characters for a password', () => {
    expect(validateLockSecret('pin', '12345')).toBe('Use at least 6 digits');
    expect(validateLockSecret('pin', '12345a')).toBe('Use digits only');
    expect(validateLockSecret('pin', '123456')).toBeNull();
    expect(validateLockSecret('password', 'short')).toBe('Use at least 8 characters');
    expect(validateLockSecret('password', 'long enough')).toBeNull();
  });
});
