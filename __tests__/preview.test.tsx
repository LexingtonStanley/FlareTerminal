import { act, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AppState, type AppStateStatus } from 'react-native';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import { ChannelOpenError, OPEN_FAILURE } from '@/features/ssh/client';
import { localServers } from '@/test-utils/fake-local-server';
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
jest.mock('@/features/preview/local-server', () =>
  jest.requireActual('@/test-utils/fake-local-server')
);

const DEVBOX: Connection = {
  id: 'devbox',
  kind: 'ssh',
  name: 'Devbox',
  host: 'devbox',
  port: 22,
  username: 'ada',
};

const bytes = (text: string) => new TextEncoder().encode(text);

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
  localServers.splice(0);
});
afterEach(() => jest.restoreAllMocks());

async function openSession(connection: Connection = DEVBOX) {
  writeJson('flare.connections.v1', [connection]);
  const app = await renderApp('/');
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: `Open ${connection.name}` }));
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  return { app, user, transport };
}

/** The preview's web view, and the address it was told to load. */
async function webView(port: number) {
  const view = await screen.findByLabelText(`Preview of localhost:${port}`);
  return (view.props as { source: { uri: string } }).source.uri;
}

describe('dev server preview', () => {
  it('opens a port the session printed, through the session’s SSH connection', async () => {
    const { user, transport } = await openSession();
    await act(() => transport.output('  VITE ready\r\n  ➜  Local:   http://localhost:5173/\r\n'));

    await user.press(screen.getByRole('button', { name: 'Preview a dev server' }));
    await user.press(await screen.findByRole('button', { name: 'Preview localhost:5173' }));

    expect(await webView(5173)).toBe('http://localhost:5173/');
    // The host was asked once, then the phone's own port 5173 forwards to the host's.
    expect(transport.tunnels).toEqual([expect.objectContaining({ port: 5173, closed: true })]);
    expect(localServers).toEqual([expect.objectContaining({ port: 5173, closed: false })]);

    // The browser's connection goes through a tunnel, both ways.
    const browser = localServers[0].connect();
    browser.events.onData(bytes('GET / HTTP/1.1\r\n\r\n'));
    await waitFor(() => expect(transport.tunnels).toHaveLength(2));
    const tunnel = transport.tunnels[1];
    await waitFor(() => expect(tunnel.sent).toEqual(['GET / HTTP/1.1\r\n\r\n']));
    tunnel.events.onData(bytes('HTTP/1.1 200 OK\r\n\r\n'));
    expect(browser.received).toEqual(['HTTP/1.1 200 OK\r\n\r\n']);

    // Leaving the preview closes the port and its connections, not the session.
    await act(() => router.back());
    await waitFor(() => expect(localServers[0].closed).toBe(true));
    expect(browser.closed).toBe(true);
    expect(tunnel.closed).toBe(true);
    expect(transport.closed).toBe(false);
    expect(readJson('flare.preview-ports.v1')).toEqual({ devbox: 5173 });
  });

  it('opens a localhost link from the terminal at its page', async () => {
    const { user, transport } = await openSession();
    await act(() => transport.output('ready on http://localhost:3000/docs?tab=api\r\n'));

    await user.press(
      await screen.findByRole('link', { name: 'http://localhost:3000/docs?tab=api' })
    );

    expect(await webView(3000)).toBe('http://localhost:3000/docs?tab=api');
  });

  it('goes straight to the last port, and the address changes it', async () => {
    writeJson('flare.preview-ports.v1', { devbox: 8080 });
    const { user } = await openSession();

    await user.press(screen.getByRole('button', { name: 'Preview a dev server' }));
    expect(await webView(8080)).toBe('http://localhost:8080/');

    await user.press(screen.getByRole('button', { name: 'localhost:8080, change port' }));
    await user.clear(await screen.findByLabelText('Port'));
    await user.type(screen.getByLabelText('Port'), '4321');
    await user.press(screen.getByRole('button', { name: 'Open preview' }));

    expect(await webView(4321)).toBe('http://localhost:4321/');
    expect(localServers.map(({ port, closed }) => [port, closed])).toEqual([
      [8080, true],
      [4321, false],
    ]);
  });

  it('says when nothing is listening on the port, and tries again', async () => {
    writeJson('flare.preview-ports.v1', { devbox: 3000 });
    const { user, transport } = await openSession();
    transport.refuseTunnels = new ChannelOpenError(
      OPEN_FAILURE.CONNECT_FAILED,
      'Connection refused'
    );

    await user.press(screen.getByRole('button', { name: 'Preview a dev server' }));

    expect(
      await screen.findByText(
        'Nothing is listening on port 3000 on Devbox. Start the dev server, then try again.'
      )
    ).toBeOnTheScreen();
    expect(localServers).toEqual([]);

    transport.refuseTunnels = null;
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await webView(3000)).toBe('http://localhost:3000/');
  });

  it('keeps a session that doesn’t stay connected open while previewing it', async () => {
    writeJson('flare.preview-ports.v1', { devbox: 3000 });
    const { user, transport } = await openSession({ ...DEVBOX, keepAlive: false });

    await user.press(screen.getByRole('button', { name: 'Preview a dev server' }));
    await webView(3000);

    expect(transport.closed).toBe(false);
  });

  it('listens again when the app comes back, as iOS can take the port back', async () => {
    // Jest has no app lifecycle: keep the app's listeners to play it going away and back.
    const appStateListeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    writeJson('flare.preview-ports.v1', { devbox: 3000 });
    const { user, transport } = await openSession();
    await user.press(screen.getByRole('button', { name: 'Preview a dev server' }));
    await webView(3000);

    await act(() => appStateListeners.forEach((listener) => listener('background')));
    await act(() => appStateListeners.forEach((listener) => listener('active')));

    await waitFor(() => expect(localServers).toHaveLength(2));
    expect(localServers.map(({ port, closed }) => [port, closed])).toEqual([
      [3000, true],
      [3000, false],
    ]);
    expect(await webView(3000)).toBe('http://localhost:3000/');
    localServers[1].connect().events.onData(bytes('GET / HTTP/1.1\r\n\r\n'));
    await waitFor(() => expect(transport.tunnels).toHaveLength(2));
  });

  it('offers no preview over ttyd', async () => {
    await openSession({
      id: 'web',
      kind: 'ttyd',
      name: 'Web',
      url: 'localhost:7681',
      username: '',
    });

    expect(await screen.findByRole('button', { name: 'Close session' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Preview a dev server' })).not.toBeOnTheScreen();
  });
});
