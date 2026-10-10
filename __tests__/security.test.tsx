import { act, userEvent } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import type { Group } from '@/features/groups/groups';
import { Vault } from '@/features/vault/vault';
import { transports } from '@/test-utils/fake-transport';
import { clearMemoryStorage, writeJson } from '@/test-utils/memory-storage';
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

/** A PIN lock from a previous launch, with a cheap key derivation so tests stay fast. */
async function lockedWith(pin: string) {
  const vault = new Vault({ cost: { N: 2 ** 10, r: 8, p: 1 } });
  await vault.create('pin', pin);
  vault.close();
}

function saved(connections: Connection[], groups: Group[] = []) {
  writeJson('flare.connections.v1', connections);
  writeJson('flare.groups.v1', groups);
}

async function unlockWith(pin: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('PIN'), pin);
  await user.press(screen.getByRole('button', { name: 'Unlock' }));
}

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
});
afterEach(() => jest.restoreAllMocks());

describe('app lock', () => {
  it('turns on a PIN in Settings, locks, and unlocks only with the right PIN', async () => {
    const user = userEvent.setup();
    await renderApp('/security');

    await user.type(await screen.findByLabelText('New PIN'), '1234');
    await user.type(screen.getByLabelText('Repeat the PIN'), '1234');
    await user.press(screen.getByRole('button', { name: 'Turn on app lock' }));
    expect(await screen.findByText('Use at least 6 digits')).toBeOnTheScreen();

    await user.clear(screen.getByLabelText('New PIN'));
    await user.type(screen.getByLabelText('New PIN'), '246810');
    await user.clear(screen.getByLabelText('Repeat the PIN'));
    await user.type(screen.getByLabelText('Repeat the PIN'), '246810');
    await user.press(screen.getByRole('button', { name: 'Turn on app lock' }));
    await user.press(await screen.findByRole('button', { name: 'Lock now' }));

    expect(await screen.findByRole('heading', { name: 'Flare is locked' })).toBeOnTheScreen();
    await unlockWith('000000');
    expect(await screen.findByText('Wrong PIN')).toBeOnTheScreen();
    await unlockWith('246810');
    expect(screen.queryByRole('heading', { name: 'Flare is locked' })).not.toBeOnTheScreen();
  });

  it('starts locked once a lock is set', async () => {
    await lockedWith('123456');
    saved([DEVBOX]);
    await renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Flare is locked' })).toBeOnTheScreen();
    await unlockWith('123456');
    expect(screen.queryByRole('heading', { name: 'Flare is locked' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open Devbox' })).toBeOnTheScreen();
  });

  it('asks again each time you come back to a protected connection, which stays connected', async () => {
    await lockedWith('123456');
    saved([{ ...DEVBOX, protected: true }]);
    const user = userEvent.setup();
    await renderApp('/');
    await unlockWith('123456');

    await user.press(screen.getByRole('button', { name: 'Open Devbox' }));
    expect(await screen.findByRole('heading', { name: 'Unlock Devbox' })).toBeOnTheScreen();
    expect(transports).toHaveLength(0);
    await unlockWith('123456');
    const transport = transports[0];
    await act(() => transport.status({ state: 'connected' }));
    expect(await screen.findByLabelText('Status: Connected')).toBeOnTheScreen();

    await act(() => router.back());
    expect(await screen.findByRole('button', { name: 'Resume Devbox' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Resume Devbox' }));
    expect(await screen.findByRole('heading', { name: 'Unlock Devbox' })).toBeOnTheScreen();
    expect(transport.closed).toBe(false);

    // Its alerts stay behind the lock too.
    await act(() => router.back());
    await act(() => transport.output('\x1b]9;Deploying to prod with key abc\x07'));
    expect(await screen.findByText('Needs your attention')).toBeOnTheScreen();
    expect(screen.queryByText(/Deploying/)).not.toBeOnTheScreen();
  });

  it('can forget the key while locked: a session that drops reconnects after the unlock', async () => {
    await lockedWith('123456');
    saved([DEVBOX]);
    const user = userEvent.setup();
    await renderApp('/');
    await unlockWith('123456');
    await user.press(screen.getByRole('button', { name: 'Open Devbox' }));
    const transport = transports[0];
    await act(() => transport.status({ state: 'connected' }));

    await act(() => router.push('/security'));
    const forget = await screen.findByRole('switch', { name: 'Forget the key when locked' });
    expect(forget).not.toBeChecked();
    await user.press(forget);
    expect(forget).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Lock now' }));
    expect(await screen.findByRole('heading', { name: 'Flare is locked' })).toBeOnTheScreen();

    // Its password and keys are sealed until the unlock, so it doesn't try without them.
    await act(() => transport.status({ state: 'closed', message: 'Connection lost', retry: true }));
    await act(() => jest.advanceTimersByTime(60_000));
    expect(transports).toHaveLength(1);

    await unlockWith('123456');
    expect(transports).toHaveLength(2);
  });

  it('forgets the key once the app has been away the auto-lock time', async () => {
    // Jest has no app lifecycle: keep the app's listeners to play it leaving and coming back.
    const appState: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appState.push(listener as (state: AppStateStatus) => void);
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    const vault = new Vault({ cost: { N: 2 ** 10, r: 8, p: 1 } });
    await vault.create('pin', '123456');
    vault.setForgetKey(true);
    vault.close();
    saved([DEVBOX]);
    const user = userEvent.setup();
    await renderApp('/');
    await unlockWith('123456');
    await user.press(screen.getByRole('button', { name: 'Open Devbox' }));
    const transport = transports[0];
    await act(() => transport.status({ state: 'connected' }));

    await act(() => appState.forEach((listener) => listener('background')));
    await act(() => jest.advanceTimersByTime(59_000));
    expect(screen.queryByRole('heading', { name: 'Flare is locked' })).not.toBeOnTheScreen();
    await act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByRole('heading', { name: 'Flare is locked' })).toBeOnTheScreen();

    // Dropped while away: coming back doesn't reconnect it until the unlock.
    await act(() => transport.status({ state: 'closed', message: 'Connection lost', retry: true }));
    await act(() => appState.forEach((listener) => listener('active')));
    await act(() => jest.advanceTimersByTime(60_000));
    expect(transports).toHaveLength(1);
    await unlockWith('123456');
    expect(transports).toHaveLength(2);
  });

  it('protects every connection in a protected group', async () => {
    await lockedWith('123456');
    saved([{ ...DEVBOX, groupId: 'prod' }], [{ id: 'prod', name: 'Prod', protected: true }]);
    const user = userEvent.setup();
    await renderApp('/');
    await unlockWith('123456');

    await user.press(screen.getByRole('button', { name: 'Open Devbox' }));
    expect(
      await screen.findByText('Its group is protected. It stays connected while locked.')
    ).toBeOnTheScreen();
  });
});

describe('keep alive', () => {
  it('disconnects a connection set not to stay connected when you leave it', async () => {
    saved([{ ...DEVBOX, keepAlive: false }]);
    const user = userEvent.setup();
    await renderApp('/');

    await user.press(await screen.findByRole('button', { name: 'Open Devbox' }));
    const transport = transports[0];
    await act(() => transport.status({ state: 'connected' }));
    await act(() => router.back());

    expect(await screen.findByRole('button', { name: 'Open Devbox' })).toBeOnTheScreen();
    expect(transport.closed).toBe(true);
    expect(screen.queryByRole('button', { name: 'Resume Devbox' })).not.toBeOnTheScreen();
  });
});

describe('groups', () => {
  it('shows one group’s connections at a time, and adds new ones to it', async () => {
    saved(
      [DEVBOX, { ...DEVBOX, id: 'prod1', name: 'Prod one', groupId: 'prod' }],
      [{ id: 'prod', name: 'Prod', protected: false }]
    );
    const user = userEvent.setup();
    const app = await renderApp('/');

    expect(await screen.findByRole('button', { name: 'Open Devbox' })).toBeOnTheScreen();
    await user.press(screen.getByRole('tab', { name: 'Prod' }));
    expect(screen.queryByRole('button', { name: 'Open Devbox' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open Prod one' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'New connection' }));
    expect(app).toHavePathname('/connections/new');
    expect(await screen.findByRole('radio', { name: 'Prod' })).toBeChecked();
  });

  it('creates a group from Home', async () => {
    saved([DEVBOX]);
    const user = userEvent.setup();
    await renderApp('/');

    await user.press(await screen.findByRole('button', { name: 'New group' }));
    await user.type(await screen.findByLabelText('Name'), 'Work');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('tab', { name: 'Work' })).toBeOnTheScreen();
  });
});
