import { fromBase64, toBase64 } from './bytes';
import { fingerprint } from './host-keys';
import { describeKeyRequest, keyRequestText, type KeyRequest } from './key-request';
import { describeSavedKey } from './keys';
import { generateUserKey, publicKeyBlob } from './user-key';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/lib/secrets', () => jest.requireActual('@/test-utils/memory-storage'));

// github.com's Ed25519 host key, as its docs publish it.
const GITHUB = fromBase64('AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl');
const phoneKey = describeSavedKey('flare', 'Flare key', generateUserKey());
const lexbox = publicKeyBlob(generateUserKey());
const stranger = publicKeyBlob(generateUserKey());
const trusted = (key: string) => (key === toBase64(lexbox) ? 'lexbox.tail.ts.net' : null);

const signIn = (hostKey: Uint8Array | null, through: Uint8Array[] = []) =>
  describeKeyRequest(
    { key: new Uint8Array(), purpose: { kind: 'sign-in', user: 'git', hostKey }, through },
    phoneKey,
    trusted
  );

describe('describeKeyRequest', () => {
  it('names code hosts and computers the phone trusts, by their host keys', () => {
    expect(signIn(GITHUB, [lexbox, stranger])).toEqual({
      key: {
        id: 'flare',
        name: 'Flare key',
        kind: 'ED25519',
        fingerprint: phoneKey.fingerprint,
      },
      purpose: {
        kind: 'sign-in',
        user: 'git',
        host: {
          name: 'github.com',
          fingerprint: 'SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU',
        },
      },
      through: [
        { name: 'lexbox.tail.ts.net', fingerprint: fingerprint(lexbox) },
        { name: null, fingerprint: fingerprint(stranger) },
      ],
    });
  });
});

describe('keyRequestText', () => {
  it('says what signing does, and where it came from', () => {
    expect(keyRequestText(signIn(GITHUB))).toEqual({ action: 'Sign in to github.com as git' });
    expect(keyRequestText(signIn(lexbox, [GITHUB, stranger]))).toEqual({
      action: 'Sign in to lexbox.tail.ts.net as git',
      path: `Forwarded on to github.com, then ${fingerprint(stranger)}`,
    });
  });

  it('shows a computer Flare doesn’t know by its host key, and warns when none was named', () => {
    expect(keyRequestText(signIn(stranger))).toEqual({
      action: 'Sign in as git to a computer Flare doesn’t know',
      hostKey: fingerprint(stranger),
    });
    expect(keyRequestText(signIn(null))).toEqual({
      action: 'Sign in as git',
      warning:
        'Flare can’t tell which computer this is for: the program asking didn’t say. ssh before OpenSSH 8.9 doesn’t.',
    });
  });

  it('names signatures by what they sign, and warns about what it can’t read', () => {
    const request = (purpose: KeyRequest['purpose']): KeyRequest => ({
      key: phoneKey,
      purpose,
      through: [],
    });
    expect(keyRequestText(request({ kind: 'sshsig', namespace: 'git' })).action).toBe(
      'Sign a git commit or tag'
    );
    expect(keyRequestText(request({ kind: 'sshsig', namespace: 'file' })).action).toBe(
      'Sign a file'
    );
    expect(keyRequestText(request({ kind: 'sshsig', namespace: 'example.com' })).action).toBe(
      'Sign something for “example.com”'
    );
    expect(keyRequestText(request({ kind: 'unknown' }))).toEqual({
      action: 'Sign something Flare can’t read',
      warning:
        'It isn’t a sign-in or a signature Flare recognizes. Deny it unless you know what asked.',
    });
  });
});
