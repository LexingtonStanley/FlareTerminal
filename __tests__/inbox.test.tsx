import { act, userEvent, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
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
jest.mock('@/features/notifications/notify', () => jest.requireActual('@/test-utils/fake-notify'));

const DEVBOX: Connection = {
  id: 'devbox',
  kind: 'ssh',
  name: 'Devbox',
  host: 'devbox',
  port: 22,
  username: 'ada',
};

/** Opens a connection from Home, connects it and goes back. */
async function startSession(name: string, index: number) {
  await userEvent.setup().press(await screen.findByRole('button', { name: `Open ${name}` }));
  const transport = transports[index];
  await act(() => transport.status({ state: 'connected' }));
  await act(() => router.back());
  return transport;
}

/** The inbox reads screens once a second, so a change can take that long to show. */
const LOOK = { timeout: 2500 };

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
});

describe('agent inbox', () => {
  it('explains itself when no session is open', async () => {
    await renderApp('/inbox');

    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeOnTheScreen();
    expect(screen.getByText('No sessions open')).toBeOnTheScreen();
  });

  it('sorts sessions by what they need, with their last screen line', async () => {
    writeJson('flare.connections.v1', [DEVBOX]);
    secrets.set('connection.devbox.password', 's3cret');
    await renderApp('/');
    const transport = await startSession('Devbox', 0);

    await act(() => transport.output('⏺ All 41 tests pass.\r\n'));
    await act(() => router.push('/inbox'));

    expect(await screen.findByText('All 41 tests pass.', {}, LOOK)).toBeOnTheScreen();
    const working = screen.getByRole('button', { name: /^Open Devbox/ });
    expect(screen.getByText('Working · 1')).toBeOnTheScreen();
    expect(within(working).getByText('active')).toBeOnTheScreen();

    await act(() => transport.output('\x1b]9;Claude needs your permission\x07'));

    expect(await screen.findByText('Needs you · 1', {}, LOOK)).toBeOnTheScreen();
    expect(screen.queryByText(/^Working/)).not.toBeOnTheScreen();
    expect(screen.getByText('1 needs you')).toBeOnTheScreen();
    expect(screen.getByText('Claude needs your permission')).toBeOnTheScreen();
    // The list shows it; no banner on top of it.
    expect(screen.queryByRole('button', { name: /^Go to Devbox/ })).not.toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: /^Open Devbox/ }));
    expect(await screen.findByRole('heading', { name: 'Devbox' })).toBeOnTheScreen();
  });

  it('keeps a protected connection’s screen out of the list', async () => {
    const prod = { ...DEVBOX, id: 'prod', name: 'Prod', host: 'prod', protected: true };
    writeJson('flare.connections.v1', [DEVBOX, prod]);
    secrets.set('connection.devbox.password', 's3cret');
    secrets.set('connection.prod.password', 's3cret');
    await renderApp('/');
    const secret = await startSession('Prod', 0);
    const open = await startSession('Devbox', 1);

    await act(() => secret.output('export TOKEN=hunter2\r\n'));
    await act(() => open.output('npm run build\r\n'));
    await act(() => router.push('/inbox'));

    // Once Devbox's line shows, the inbox has read both screens.
    expect(await screen.findByText('npm run build', {}, LOOK)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Open Prod/ })).toBeOnTheScreen();
    expect(screen.queryByText(/hunter2/)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /hunter2/ })).not.toBeOnTheScreen();
  });
});
