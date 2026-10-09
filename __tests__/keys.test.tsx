import { act, fireEvent, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import { clearMemoryStorage, readJson, secrets, writeJson } from '@/test-utils/memory-storage';
import { renderApp } from '@/test-utils/render-app';
import { generateTestKey } from '@/test-utils/ssh-keys';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/lib/secrets', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/features/terminal/terminal-view', () =>
  jest.requireActual('@/test-utils/fake-terminal-view')
);
jest.mock('@/features/terminal/open-transport', () =>
  jest.requireActual('@/test-utils/fake-transport')
);
jest.mock('@/features/notifications/notify', () => jest.requireActual('@/test-utils/fake-notify'));

const mockClipboard = { text: '' };
jest.mock('expo-clipboard', () => ({
  getStringAsync: async () => mockClipboard.text,
  setStringAsync: async (text: string) => {
    mockClipboard.text = text;
    return true;
  },
}));

beforeEach(() => {
  clearMemoryStorage();
  mockClipboard.text = '';
});

/** Imports must read keys ssh-keygen style; ssh2 writes them here. */
const file = generateTestKey('ed25519', { comment: 'ada@laptop' });
const encrypted = generateTestKey('ecdsa-256', { passphrase: 'correct horse', comment: 'work' });
/** Enough rounds to leave halfway through unlocking it. */
const slow = generateTestKey('ed25519', { passphrase: 'pw', rounds: 16 });

async function importKey(text: string, passphrase?: string) {
  const user = userEvent.setup();
  await renderApp('/settings');
  await user.press(await screen.findByRole('button', { name: 'Import a key' }));
  // A paste, not keystrokes.
  await fireEvent.changeText(await screen.findByLabelText('Private key'), text);
  if (passphrase !== undefined) await user.type(screen.getByLabelText('Passphrase'), passphrase);
  await user.press(screen.getByRole('button', { name: 'Import key' }));
  return user;
}

describe('SSH keys', () => {
  it('makes the Flare key and shows how to authorize it', async () => {
    const user = userEvent.setup();
    await renderApp('/settings');

    await user.press(await screen.findByRole('button', { name: 'Create a Flare key' }));

    const line = await screen.findByLabelText('Public key');
    expect(line).toHaveTextContent(/^ssh-ed25519 AAAA\S+ flare-terminal$/);
    expect(screen.getByText(/>> ~\/\.ssh\/authorized_keys$/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Copy public key' }));
    expect(mockClipboard.text).toMatch(/^ssh-ed25519 /);

    await act(() => router.back());
    expect(await screen.findByRole('button', { name: 'Flare key, ED25519' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Create a Flare key' })).not.toBeOnTheScreen();
  });

  it('imports a pasted key, names it after its comment and clears the clipboard', async () => {
    mockClipboard.text = file.private;
    const user = userEvent.setup();
    await renderApp('/keys/new');

    await user.press(await screen.findByRole('button', { name: 'Paste' }));
    expect(screen.queryByLabelText('Passphrase')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Import key' }));

    expect(await screen.findByLabelText('Public key')).toHaveTextContent(file.public);
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('ada@laptop');
    expect(mockClipboard.text).toBe('');
    const [saved] = readJson<{ id: string }[]>('flare.ssh-keys.v1') ?? [];
    expect(secrets.get(`ssh.key.${saved.id}`)).toEqual(expect.any(String));
  });

  it('asks for the passphrase and says when it’s wrong', async () => {
    const user = await importKey(encrypted.private, 'wrong');

    expect(await screen.findByText('Wrong passphrase')).toBeOnTheScreen();

    await user.clear(screen.getByLabelText('Passphrase'));
    await user.type(screen.getByLabelText('Passphrase'), 'correct horse');
    await user.press(screen.getByRole('button', { name: 'Import key' }));

    expect(await screen.findByLabelText('Public key')).toHaveTextContent(encrypted.public);
    // Nothing keeps the passphrase.
    expect(JSON.stringify([...secrets.values()])).not.toContain('correct horse');
  });

  it('stops unlocking a key when you leave the screen', async () => {
    const user = userEvent.setup();
    const app = await renderApp('/settings');
    await user.press(await screen.findByRole('button', { name: 'Import a key' }));
    await fireEvent.changeText(await screen.findByLabelText('Private key'), slow.private);
    await user.type(screen.getByLabelText('Passphrase'), 'pw');
    await user.press(screen.getByRole('button', { name: 'Import key' }));
    expect(await screen.findByText(/Unlocking the key with its passphrase/)).toBeOnTheScreen();

    await act(() => router.back());
    // The router test helper fakes timers; run every round that's left.
    await act(() => jest.advanceTimersByTimeAsync(1000));

    expect(app).toHavePathname('/settings');
    expect(readJson('flare.ssh-keys.v1')).toBeNull();
  });

  it('explains a key in the old PEM format', async () => {
    await importKey('-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----');

    expect(await screen.findByText(/run ssh-keygen -p -f <key file>/)).toBeOnTheScreen();
    expect(readJson('flare.ssh-keys.v1')).toBeNull();
  });

  it('refuses a key it already has', async () => {
    await importKey(file.private);
    await screen.findByLabelText('Public key');
    await act(() => router.push('/keys/new'));
    await fireEvent.changeText(await screen.findByLabelText('Private key'), file.private);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Import key' }));

    expect(
      await screen.findByText('You already have this key, named ada@laptop.')
    ).toBeOnTheScreen();
  });

  it('renames and deletes a key', async () => {
    const user = await importKey(file.private);
    const name = await screen.findByLabelText('Name');

    await user.clear(name);
    await user.type(name, 'Laptop key');
    await fireEvent(name, 'blur');
    expect(readJson('flare.ssh-keys.v1')).toEqual([
      expect.objectContaining({ name: 'Laptop key' }),
    ]);
    await user.press(screen.getByRole('button', { name: 'Delete key' }));
    await user.press(screen.getByRole('button', { name: 'Tap again to delete the key' }));

    await waitFor(() => expect(readJson('flare.ssh-keys.v1')).toEqual([]));
    expect([...secrets.keys()].filter((name) => name.startsWith('ssh.key.'))).toEqual([]);
  });
});

describe('a connection’s key', () => {
  const DEVBOX: Connection = {
    id: 'devbox',
    kind: 'ssh',
    name: 'Devbox',
    host: 'devbox',
    port: 22,
    username: 'ada',
  };

  it('offers every key until one is chosen', async () => {
    writeJson('flare.connections.v1', [DEVBOX]);
    await importKey(file.private);
    await screen.findByLabelText('Public key');
    const user = userEvent.setup();

    await act(() => router.push('/connections/devbox'));

    expect(await screen.findByRole('radio', { name: 'Any key' })).toBeChecked();
    expect(screen.getByText('Offers each of your keys, then the password')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'ada@laptop' }));
    expect(screen.getByText('Offers only this key, then the password')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Save' }));

    const [saved] = readJson<{ id: string }[]>('flare.ssh-keys.v1') ?? [];
    await waitFor(() =>
      expect(readJson<Connection[]>('flare.connections.v1')?.[0]).toMatchObject({
        keyId: saved.id,
      })
    );
  });

  it('shows no key choice without keys', async () => {
    writeJson('flare.connections.v1', [DEVBOX]);
    await renderApp('/connections/devbox');

    expect(await screen.findByLabelText('Host')).toBeOnTheScreen();
    expect(screen.queryByRole('radiogroup', { name: 'SSH key' })).not.toBeOnTheScreen();
  });
});
