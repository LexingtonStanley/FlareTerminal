import { act, fireEvent, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import { posted } from '@/test-utils/fake-notify';
import { FAKE_SIZE } from '@/test-utils/fake-terminal-view';
import { transports } from '@/test-utils/fake-transport';
import { clearMemoryStorage, readJson, secrets, writeJson } from '@/test-utils/memory-storage';
import { renderApp } from '@/test-utils/render-app';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/lib/secrets', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/features/terminal/terminal-view', () =>
  jest.requireActual('@/test-utils/fake-terminal-view')
);
jest.mock('@/features/terminal/open-transport', () =>
  jest.requireActual('@/test-utils/fake-transport')
);
jest.mock('@/features/notifications/notify', () => jest.requireActual('@/test-utils/fake-notify'));

const DEVBOX: Connection = {
  id: 'devbox',
  kind: 'ssh',
  name: 'Devbox',
  host: 'devbox',
  port: 22,
  username: 'ada',
};

/** Starts the app with saved connections, as if from a previous launch. */
function saved(...connections: unknown[]) {
  writeJson('flare.connections.v1', connections);
}

/** The in-app keys have no onPress (one surface tracks every finger); act on them by name. */
async function keyAction(
  name: string,
  actionName = 'activate',
  role: 'button' | 'switch' = 'button'
) {
  await fireEvent(screen.getByRole(role, { name }), 'accessibilityAction', {
    nativeEvent: { actionName },
  });
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
  posted.splice(0);
});

describe('connections', () => {
  it('explains how to connect over SSH when nothing is saved', async () => {
    await renderApp('/');

    expect(await screen.findByText('Connect to your computer over SSH')).toBeOnTheScreen();
    expect(screen.getByText('ssh lexde@lexbox')).toBeOnTheScreen();
  });

  it('saves an SSH connection typed as user@host, password in secure storage', async () => {
    const user = userEvent.setup();
    const app = await renderApp('/');

    await user.press(await screen.findByRole('button', { name: 'New connection' }));
    expect(await screen.findByRole('radio', { name: 'SSH' })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Enter the computer’s name or IP, e.g. lexbox')
    ).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Host'), 'lexde@lexbox');
    await user.type(screen.getByLabelText('Password'), 's3cret');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Open lexde@lexbox' })).toBeOnTheScreen();
    expect(app).toHavePathname('/');
    expect([...secrets.values()]).toEqual(['s3cret']);
  });

  it('saves a ttyd connection', async () => {
    const user = userEvent.setup();
    await renderApp('/connections/new');

    await user.press(await screen.findByRole('radio', { name: 'ttyd' }));
    await user.type(screen.getByLabelText('Address'), 'devbox:7681');
    await user.type(screen.getByLabelText('Username'), 'ada');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter the password for this username')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Password'), 's3cret');
    await user.type(screen.getByLabelText('Name'), 'Devbox');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Open Devbox' })).toBeOnTheScreen();
    expect(screen.getByText('ttyd · devbox:7681')).toBeOnTheScreen();
  });

  it('reads ttyd connections saved by the first version', async () => {
    saved({ id: 'old', name: 'Old box', url: 'old:7681', username: '' });
    await renderApp('/');

    expect(await screen.findByText('ttyd · old:7681')).toBeOnTheScreen();
  });

  it('shows and forgets the trusted host key', async () => {
    saved(DEVBOX);
    writeJson('flare.known-hosts.v1', {
      devbox: { type: 'ssh-ed25519', key: 'AAAA', fingerprint: 'SHA256:abc', addedAt: '' },
    });
    const user = userEvent.setup();
    await renderApp('/connections/devbox');

    expect(await screen.findByText('SHA256:abc')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Forget host key' }));

    expect(screen.queryByText('SHA256:abc')).not.toBeOnTheScreen();
  });

  it('removes the password when a connection is deleted', async () => {
    saved(DEVBOX);
    secrets.set('connection.devbox.password', 's3cret');
    const user = userEvent.setup();
    await renderApp('/connections/devbox');

    await user.press(await screen.findByRole('button', { name: 'Delete connection' }));
    await user.press(screen.getByRole('button', { name: 'Tap again to delete' }));

    expect(await screen.findByText('Connect to your computer over SSH')).toBeOnTheScreen();
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

    await keyAction('Control', 'activate', 'switch');
    expect(ctrl).toBeChecked();
    await user.type(screen.getByLabelText('Command'), 'c');

    expect(transport.written).toEqual(['\x03']);
    expect(ctrl).not.toBeChecked();
    expect(screen.getByLabelText('Command')).toHaveDisplayValue('');
  });

  it('sends the bar’s keys, flicks included', async () => {
    const { transport } = await openDevbox();

    await keyAction('Escape');
    await keyAction('Tab', 'up');
    await keyAction('Arrow keys', 'up');
    await keyAction('Pipe', 'up');
    await keyAction('Control', 'up', 'switch');

    expect(transport.written).toEqual(['\x1b', '\x1b[Z', '\x1b[A', '~', '\x03']);
  });

  it('swaps to the coding keyboard and remembers the choice', async () => {
    const { transport } = await openDevbox();

    await keyAction('Coding keyboard');
    expect(await screen.findByLabelText('Coding keyboard')).toBeOnTheScreen();
    // The composer belongs to the phone's keyboard.
    expect(screen.queryByLabelText('Command')).not.toBeOnTheScreen();
    expect(readJson('flare.preferences.v1')).toMatchObject({ keyboard: 'coding' });

    await keyAction('l');
    await keyAction('s');
    await keyAction('Enter');
    expect(transport.written).toEqual(['l', 's', '\r']);

    await keyAction('System keyboard');
    expect(await screen.findByLabelText('Command')).toBeOnTheScreen();
    expect(readJson('flare.preferences.v1')).toMatchObject({ keyboard: 'system' });
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

  it('keeps the session running after leaving, and resumes it with its screen', async () => {
    const { transport } = await openDevbox();
    await act(() => transport.output('$ make test\r\n'));
    expect(await screen.findByText('$ make test')).toBeOnTheScreen();

    // Jest renders the native stack header, which has no back button to press.
    await act(() => router.back());
    await act(() => transport.output('42 passed\r\n'));

    expect(transport.closed).toBe(false);
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Resume Devbox' }));

    // The session's own copy of the screen is replayed into the new view.
    expect(await screen.findByText(/make test[\s\S]*42 passed/)).toBeOnTheScreen();
    expect(transports).toHaveLength(1);
  });

  it('closes a session from its screen', async () => {
    const { transport } = await openDevbox();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Close session' }));

    expect(await screen.findByRole('button', { name: 'Open Devbox' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Resume Devbox' })).not.toBeOnTheScreen();
    expect(transport.closed).toBe(true);
  });

  it('flags a background session that asks for attention', async () => {
    const { transport } = await openDevbox();
    await act(() => router.back());

    await act(() => transport.output('\x1b]9;Claude needs your permission\x07'));

    // Home shows it on the session's row; the banner is for other screens.
    expect(await screen.findByText('Claude needs your permission')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Go to Devbox/ })).not.toBeOnTheScreen();
    // Foreground: no system notification.
    expect(posted).toEqual([]);

    await userEvent.setup().press(screen.getByRole('button', { name: 'Resume Devbox' }));
    expect(await screen.findByRole('heading', { name: 'Devbox' })).toBeOnTheScreen();
    expect(screen.queryByText('Claude needs your permission')).not.toBeOnTheScreen();
  });

  it('explains a session that no longer exists', async () => {
    await renderApp('/session/nope');

    expect(await screen.findByRole('heading', { name: 'Session not found' })).toBeOnTheScreen();
    expect(transports).toHaveLength(0);
  });
});

describe('shortcuts', () => {
  it('saves a Claude-in-tmux shortcut and runs it with one tap', async () => {
    saved(DEVBOX);
    const user = userEvent.setup();
    await renderApp('/');

    await user.press(await screen.findByRole('button', { name: 'New shortcut' }));
    await user.press(await screen.findByRole('button', { name: 'Use Claude in tmux' }));
    await user.type(screen.getByLabelText('Folder'), '~/code/flare');
    expect(screen.getByText("cd ~/'code/flare' && tmux new -A -s claude claude")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Save' }));

    await user.press(await screen.findByRole('button', { name: 'Run Claude' }));
    const transport = transports[0];
    await act(() => transport.status({ state: 'connected' }));

    expect(transport.connection).toEqual(DEVBOX);
    expect(transport.written).toEqual(["cd ~/'code/flare' && tmux new -A -s claude claude\r"]);
    expect(await screen.findByRole('heading', { name: 'Claude' })).toBeOnTheScreen();
  });

  it('needs a name, a connection and a command', async () => {
    saved(DEVBOX, { ...DEVBOX, id: 'other', name: 'Other' });
    const user = userEvent.setup();
    await renderApp('/shortcuts/new');

    await user.press(await screen.findByRole('button', { name: 'Save' }));

    expect(screen.getByText('Enter a name')).toBeOnTheScreen();
    expect(screen.getByText('Choose a connection')).toBeOnTheScreen();
    expect(screen.getByText('Enter a command, or pick one above')).toBeOnTheScreen();
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
