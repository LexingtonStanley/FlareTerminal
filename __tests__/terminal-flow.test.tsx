import { act, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';

import { FAKE_SIZE } from '@/test-utils/fake-terminal-view';
import { transports } from '@/test-utils/fake-transport';
import { clearMemoryStorage, secrets, writeJson } from '@/test-utils/memory-storage';
import { renderApp } from '@/test-utils/render-app';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/lib/secrets', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/features/terminal/terminal-view', () =>
  jest.requireActual('@/test-utils/fake-terminal-view')
);
jest.mock('@/features/terminal/open-transport', () =>
  jest.requireActual('@/test-utils/fake-transport')
);

const DEVBOX = { id: 'devbox', name: 'Devbox', url: 'devbox:7681', username: 'ada' };

/** Starts the app with saved connections, as if from a previous launch. */
function saved(...connections: (typeof DEVBOX)[]) {
  writeJson('flare.connections.v1', connections);
}

async function openDevbox() {
  saved(DEVBOX);
  secrets.set('connection.devbox.password', 's3cret');
  const app = await renderApp('/');
  await userEvent.setup().press(await screen.findByRole('button', { name: 'Open Devbox' }));
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  return { app, transport };
}

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
});

describe('connections', () => {
  it('explains how to start ttyd when nothing is saved', async () => {
    await renderApp('/');

    expect(await screen.findByText('Connect to a computer running ttyd')).toBeOnTheScreen();
    expect(
      screen.getByText('ttyd -W -c you:a-long-password tmux new -A -s main')
    ).toBeOnTheScreen();
  });

  it('saves a connection with its password in secure storage', async () => {
    const user = userEvent.setup();
    const app = await renderApp('/');

    await user.press(await screen.findByRole('button', { name: 'New connection' }));
    await user.type(await screen.findByLabelText('Name'), 'Devbox');
    await user.type(screen.getByLabelText('Address'), 'devbox:7681');
    await user.type(screen.getByLabelText('Username'), 'ada');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter the password for this username')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Password'), 's3cret');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Open Devbox' })).toBeOnTheScreen();
    expect(screen.getByText('ada @ devbox:7681')).toBeOnTheScreen();
    expect(app).toHavePathname('/');
    expect([...secrets.values()]).toEqual(['s3cret']);
  });

  it('removes the password when a connection is deleted', async () => {
    saved(DEVBOX);
    secrets.set('connection.devbox.password', 's3cret');
    const user = userEvent.setup();
    await renderApp('/connections/devbox');

    await user.press(await screen.findByRole('button', { name: 'Delete connection' }));
    await user.press(screen.getByRole('button', { name: 'Tap again to delete' }));

    expect(await screen.findByText('Connect to a computer running ttyd')).toBeOnTheScreen();
    expect(secrets.size).toBe(0);
  });
});

describe('terminal', () => {
  it('connects at the size the view measured, with the stored password', async () => {
    const { transport } = await openDevbox();

    expect(transport.connection).toEqual(DEVBOX);
    expect(transport.password).toBe('s3cret');
    expect(transport.size).toEqual(FAKE_SIZE);
    expect(await screen.findByLabelText('Status: Connected')).toBeOnTheScreen();
  });

  it('shows output and the title the host sends', async () => {
    const { transport } = await openDevbox();

    await act(() => {
      transport.title('claude (devbox)');
      transport.output('$ claude\r\n');
      transport.output('Welcome');
    });

    expect(await screen.findByText('claude (devbox)')).toBeOnTheScreen();
    // Output reaches the view on the next frame, batched into one write.
    expect(await screen.findByText('$ claude Welcome')).toBeOnTheScreen();
  });

  it('sends the composer text as a paste, then Enter', async () => {
    const { transport } = await openDevbox();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Command'), 'fix the failing test');
    await user.press(screen.getByRole('button', { name: 'Send' }));

    expect(transport.written).toEqual(['fix the failing test', '\r']);
    expect(screen.getByLabelText('Command')).toHaveDisplayValue('');
  });

  it('applies a sticky Ctrl to the next key, then releases it', async () => {
    const { transport } = await openDevbox();
    const user = userEvent.setup();
    const ctrl = screen.getByRole('switch', { name: 'Control' });

    await user.press(ctrl);
    expect(ctrl).toBeChecked();
    await user.type(screen.getByLabelText('Command'), 'c');

    expect(transport.written).toEqual(['\x03']);
    expect(ctrl).not.toBeChecked();
    expect(screen.getByLabelText('Command')).toHaveDisplayValue('');
  });

  it('sends key-bar keys', async () => {
    const { transport } = await openDevbox();
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Escape' }));
    await user.press(screen.getByRole('button', { name: 'Shift Tab' }));
    await user.press(screen.getByRole('button', { name: 'Up arrow' }));
    await user.press(screen.getByRole('button', { name: 'Tilde' }));

    expect(transport.written).toEqual(['\x1b', '\x1b[Z', '\x1b[A', '~']);
  });

  it('offers to reconnect when the session ends', async () => {
    const { transport } = await openDevbox();

    await act(() => transport.status({ state: 'closed', message: 'Session ended' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Session ended');

    await userEvent.setup().press(screen.getByRole('button', { name: 'Reconnect' }));

    expect(transports).toHaveLength(2);
    expect(transport.closed).toBe(true);
    // The old transport can no longer change what the screen shows.
    await act(() => transport.status({ state: 'closed', message: 'stale' }));
    expect(screen.queryByText('stale')).not.toBeOnTheScreen();
  });

  it('closes the connection when leaving the screen', async () => {
    const { transport } = await openDevbox();

    // Jest renders the native stack header, which has no back button to press.
    await act(() => router.back());

    expect(await screen.findByRole('button', { name: 'Open Devbox' })).toBeOnTheScreen();
    expect(transport.closed).toBe(true);
  });

  it('explains a missing connection', async () => {
    await renderApp('/terminal/nope');

    expect(await screen.findByRole('heading', { name: 'Connection not found' })).toBeOnTheScreen();
    expect(transports).toHaveLength(0);
  });
});

describe('settings', () => {
  it('changes the terminal font size and remembers it', async () => {
    const user = userEvent.setup();
    await renderApp('/settings');

    await user.press(await screen.findByRole('button', { name: 'Larger' }));
    await user.press(screen.getByRole('button', { name: 'Larger' }));

    expect(screen.getByLabelText('Font size')).toHaveTextContent('16');
    await openDevbox();
    expect(await screen.findByLabelText('Terminal output')).toHaveStyle({ fontSize: 16 });
  });
});
