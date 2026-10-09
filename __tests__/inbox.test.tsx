import { act, userEvent, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import type { Connection } from '@/features/connections/connections';
import { posted, tapAnswer } from '@/test-utils/fake-notify';
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

const MENU =
  '\x1b[2J\x1b[HBash command\r\n  npm test\r\nDo you want to proceed?\r\n' +
  '\u276f 1. Yes\r\n  2. No, and tell Claude what to do differently (esc)\r\n';

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
  posted.splice(0);
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

  it('approves a question from its row, once', async () => {
    writeJson('flare.connections.v1', [DEVBOX]);
    secrets.set('connection.devbox.password', 's3cret');
    await renderApp('/');
    const transport = await startSession('Devbox', 0);
    await act(() => router.push('/inbox'));

    await act(() => transport.output(MENU));
    const approve = await screen.findByRole('button', {
      name: 'Approve: Do you want to proceed?',
    });
    expect(screen.getByRole('button', { name: 'Deny: Do you want to proceed?' })).toBeOnTheScreen();

    await userEvent.setup().press(approve);

    expect(transport.written.at(-1)).toBe('1');
    expect(screen.queryByRole('button', { name: /^Approve: / })).not.toBeOnTheScreen();
  });
});

describe('answers from notifications', () => {
  /** Jest has no app lifecycle: keep the app's listeners to play it going to the background. */
  const appStateListeners: ((state: AppStateStatus) => void)[] = [];
  beforeEach(() => {
    appStateListeners.splice(0);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  async function askInBackground(connection: Connection = DEVBOX) {
    writeJson('flare.connections.v1', [connection]);
    secrets.set('connection.devbox.password', 's3cret');
    await renderApp('/');
    const transport = await startSession('Devbox', 0);
    await act(() => appStateListeners.forEach((listener) => listener('background')));
    await act(() => transport.output(MENU));
    await waitFor(() => expect(posted).toHaveLength(1));
    return transport;
  }

  it('denies from the notification, typing into the question it was about', async () => {
    const transport = await askInBackground();
    expect(posted[0]).toMatchObject({ title: 'Devbox', body: 'Do you want to proceed?' });
    expect(posted[0].questionAt).toEqual(expect.any(Number));

    await act(() => tapAnswer(posted[0], 'deny'));

    expect(transport.written.at(-1)).toBe('\x1b');
  });

  it('refuses a stale answer and says so', async () => {
    const transport = await askInBackground();
    await act(() => transport.output('\x1b[2J\x1b[H$ '));
    // Home's row stops showing the question once the screen has been read.
    await waitFor(() =>
      expect(screen.queryByText('Do you want to proceed?')).not.toBeOnTheScreen()
    );
    const sent = transport.written.length;

    await act(() => tapAnswer(posted[0], 'approve'));

    expect(transport.written).toHaveLength(sent);
    expect(posted.at(-1)?.body).toBe('Not sent: that question is no longer on screen.');
  });

  it('offers no answers for a protected connection', async () => {
    await askInBackground({ ...DEVBOX, protected: true });

    expect(posted[0]).toEqual({
      sessionId: expect.any(String),
      title: 'Devbox',
      body: 'Needs your attention',
    });
  });
});
