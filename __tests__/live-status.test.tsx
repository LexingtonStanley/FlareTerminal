import { act, userEvent, waitFor } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import { keepSessionsAlive } from '@/features/sessions/background';
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
jest.mock('@/features/sessions/background', () => ({ keepSessionsAlive: jest.fn() }));

const posted = jest.mocked(keepSessionsAlive);
const last = () => posted.mock.calls.at(-1)?.[0];

const DEVBOX: Connection = {
  id: 'devbox',
  kind: 'ssh',
  name: 'Devbox',
  host: 'devbox',
  port: 22,
  username: 'ada',
};

const SPINNER = '\x1b[2J\x1b[H✻ Pondering… (3s · esc to interrupt)\r\n';
const MENU =
  '\x1b[2J\x1b[HBash command\r\n  npm test\r\nDo you want to proceed?\r\n' +
  '❯ 1. Yes\r\n  2. No, and tell Claude what to do differently (esc)\r\n';

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
  posted.mockClear();
});

async function openSession(connection: Connection = DEVBOX) {
  writeJson('flare.connections.v1', [connection]);
  await renderApp('/');
  await userEvent.setup().press(await screen.findByRole('button', { name: 'Open Devbox' }));
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  return transport;
}

describe('the live status', () => {
  it('says what the agent is doing, and for how long', async () => {
    expect(last()).toBeUndefined();
    const transport = await openSession();
    await waitFor(() =>
      expect(last()).toEqual({ title: 'Flare Terminal', text: '1 session connected' })
    );

    await act(() => transport.output(SPINNER));
    await waitFor(() =>
      expect(last()).toEqual({ title: 'Devbox is working', text: 'Just started' })
    );

    // Each minute it says how long.
    await act(() => jest.advanceTimersByTime(3 * 60_000));
    expect(last()).toEqual({ title: 'Devbox is working', text: 'For 3m' });

    await act(() => transport.output(MENU));
    await waitFor(() =>
      expect(last()).toEqual({ title: 'Devbox needs you', text: 'Do you want to proceed?' })
    );
  });

  it('keeps a protected connection’s name and screen out of it', async () => {
    const transport = await openSession({ ...DEVBOX, protected: true });

    await act(() => transport.output(MENU));
    await waitFor(() => expect(last()).toEqual({ title: 'A session needs you', text: '' }));
  });

  it('ends with the last session', async () => {
    const transport = await openSession();
    await act(() => transport.status({ state: 'closed', message: 'Logged out' }));

    await waitFor(() => expect(last()).toBeNull());
  });
});
