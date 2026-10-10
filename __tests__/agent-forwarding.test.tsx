import { act, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import type { Connection, SshConnection } from '@/features/connections/connections';
import { createAppKey } from '@/features/ssh/app-key';
import type { KeyRequest } from '@/features/ssh/key-request';
import { Vault } from '@/features/vault/vault';
import { keyNotifications } from '@/test-utils/fake-notify';
import { transports } from '@/test-utils/fake-transport';
import { clearMemoryStorage, readJson, writeJson } from '@/test-utils/memory-storage';
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

const DEVBOX: SshConnection = {
  id: 'devbox',
  kind: 'ssh',
  name: 'Devbox',
  host: 'devbox.local',
  port: 22,
  username: 'ada',
  forwardAgent: true,
};

const GIT_PUSH: KeyRequest = {
  key: { id: 'flare', name: 'Flare key', kind: 'ED25519', fingerprint: 'SHA256:phonekey' },
  purpose: {
    kind: 'sign-in',
    user: 'git',
    host: { name: 'github.com', fingerprint: 'SHA256:github' },
  },
  through: [],
};

const saved = (...connections: Connection[]) => writeJson('flare.connections.v1', connections);

/** Jest has no app lifecycle: keep the app's listeners to play it going to the background. */
const appStateListeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
  keyNotifications.clear();
  appStateListeners.splice(0);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => jest.restoreAllMocks());

async function openDevbox(connection: Connection = DEVBOX) {
  saved(connection);
  await renderApp('/');
  await userEvent.setup().press(await screen.findByRole('button', { name: 'Open Devbox' }));
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  return transport;
}

describe('agent forwarding', () => {
  it('is a connection setting, off until turned on, once there is a key', async () => {
    createAppKey();
    saved({ ...DEVBOX, forwardAgent: undefined });
    const user = userEvent.setup();
    await renderApp('/connections/devbox');

    const toggle = await screen.findByRole('switch', { name: 'Forward SSH agent' });
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText('Lets commands there, like git push, ask to use your keys, like ssh -A')
    ).toBeOnTheScreen();
    await user.press(toggle);
    expect(
      screen.getByText(
        'Commands there, like git push, can ask to use your keys. Flare asks you each time.'
      )
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(readJson<Connection[]>('flare.connections.v1')).toEqual([
      expect.objectContaining({ id: 'devbox', forwardAgent: true }),
    ]);
  });

  it('can’t be turned on without a key', async () => {
    saved({ ...DEVBOX, forwardAgent: undefined });
    await renderApp('/connections/devbox');

    expect(await screen.findByRole('switch', { name: 'Forward SSH agent' })).toBeDisabled();
    expect(screen.getByText('Make or import an SSH key in Settings first')).toBeOnTheScreen();
  });

  it('asks whether a program may use a key, and Allow says yes', async () => {
    const transport = await openDevbox();
    expect(transport.connection).toMatchObject({ forwardAgent: true });

    const { answer } = await act(() => transport.askForKey(GIT_PUSH));

    expect(
      await screen.findByRole('heading', { name: 'Devbox asks to use your key' })
    ).toBeOnTheScreen();
    expect(screen.getByText('Sign in to github.com as git')).toBeOnTheScreen();
    expect(screen.getByText('With Flare key (ED25519)')).toBeOnTheScreen();
    expect(screen.getByText('SHA256:phonekey')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Allow' }));

    await expect(answer).resolves.toBe(true);
    expect(screen.queryByText('Sign in to github.com as git')).not.toBeOnTheScreen();
  });

  it('asks about each in turn, over any screen, and Deny says no', async () => {
    const transport = await openDevbox();
    await act(() => router.back());
    const first = await act(() => transport.askForKey(GIT_PUSH));
    const second = await act(() =>
      transport.askForKey({ ...GIT_PUSH, purpose: { kind: 'sshsig', namespace: 'git' } })
    );
    const user = userEvent.setup();

    expect(await screen.findByText('Sign in to github.com as git')).toBeOnTheScreen();
    expect(
      screen.getByText('Denied if you don’t answer within a minute. 1 more waiting.')
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Deny' }));
    await expect(first.answer).resolves.toBe(false);

    expect(await screen.findByText('Sign a git commit or tag')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Allow' }));
    await expect(second.answer).resolves.toBe(true);
  });

  it('takes the question down when the program stops waiting', async () => {
    const transport = await openDevbox();
    const { answer, giveUp } = await act(() => transport.askForKey(GIT_PUSH));
    expect(await screen.findByText('Sign in to github.com as git')).toBeOnTheScreen();

    await act(() => giveUp());

    await expect(answer).resolves.toBe(false);
    expect(screen.queryByText('Sign in to github.com as git')).not.toBeOnTheScreen();
  });

  it('notifies while the app is away, and takes it down once answered', async () => {
    const transport = await openDevbox();
    await act(() => appStateListeners.forEach((listener) => listener('background')));

    const { answer } = await act(() => transport.askForKey(GIT_PUSH));
    await waitFor(() =>
      expect([...keyNotifications.values()]).toEqual([
        { title: 'Devbox asks to use your SSH key', body: 'Open Flare to allow or deny it.' },
      ])
    );

    await act(() => appStateListeners.forEach((listener) => listener('active')));
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Allow' }));
    await expect(answer).resolves.toBe(true);
    expect(keyNotifications.size).toBe(0);
  });

  it('keeps a protected session’s request behind the app lock', async () => {
    const vault = new Vault({ cost: { N: 2 ** 10, r: 8, p: 1 } });
    await vault.create('pin', '123456');
    vault.close();
    saved({ ...DEVBOX, protected: true });
    const user = userEvent.setup();
    await renderApp('/');
    const unlock = async () => {
      await user.type(await screen.findByLabelText('PIN'), '123456');
      await user.press(screen.getByRole('button', { name: 'Unlock' }));
    };
    await unlock();
    await user.press(await screen.findByRole('button', { name: 'Open Devbox' }));
    await unlock();
    const transport = transports[0];
    await act(() => transport.status({ state: 'connected' }));
    await act(() => router.back());

    const { answer } = await act(() => transport.askForKey(GIT_PUSH));

    expect(
      await screen.findByRole('heading', { name: 'Unlock to see the request' })
    ).toBeOnTheScreen();
    expect(screen.queryByText(/github\.com/)).not.toBeOnTheScreen();
    await unlock();
    expect(await screen.findByText('Sign in to github.com as git')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Allow' }));
    await expect(answer).resolves.toBe(true);
  });
});
