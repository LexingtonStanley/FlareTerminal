import { act, fireEvent, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';
import { openBrowserAsync } from 'expo-web-browser';
import { AppState, type AppStateStatus } from 'react-native';

import type { Connection } from '@/features/connections/connections';
import { SEND_TO_PHONE_PROMPT } from '@/features/outbox/outbox';
import { READ_COMMAND, WATCH_COMMAND } from '@/features/outbox/outbox-watcher';
import { Vault } from '@/features/vault/vault';
import { postedFiles, tapFile } from '@/test-utils/fake-notify';
import { transports, type FakeTransport } from '@/test-utils/fake-transport';
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
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const DEVBOX: Connection = {
  id: 'devbox',
  kind: 'ssh',
  name: 'Devbox',
  host: 'devbox',
  port: 22,
  username: 'ada',
};

const JANUS = {
  id: 'janus',
  name: 'Janus',
  connectionId: 'devbox',
  command: 'cd ~/agents/janus && tmux new -A -s Janus claude',
  directory: '~/agents/janus',
  group: 'Agents',
  agent: { harness: 'claude', session: 'tmux', skipPermissions: false, commandEdited: false },
  confirm: false,
};

const openBrowser = jest.mocked(openBrowserAsync);

/** Jest has no app lifecycle: keep the app's listeners to play it going to the background. */
const appStateListeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
  postedFiles.splice(0);
  openBrowser.mockReset();
  appStateListeners.splice(0);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => jest.restoreAllMocks());

/** Opens a session on the connection (or runs the agent shortcut), connected. */
async function openSession({ connection = DEVBOX, shortcut = false } = {}) {
  writeJson('flare.connections.v1', [connection]);
  writeJson('flare.shortcuts.v1', shortcut ? [JANUS] : []);
  await renderApp('/');
  const user = userEvent.setup();
  await user.press(
    await screen.findByRole('button', { name: shortcut ? 'Run Janus' : `Open ${connection.name}` })
  );
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  return { user, transport };
}

const commandsNamed = (transport: FakeTransport, name: string) =>
  transport.commands.filter(({ command }) => command === name);

/**
 * The host's side: the outbox lists `name` (written a minute before the host's clock), then
 * prints it when the app asks.
 */
async function sendFile(transport: FakeTransport, name: string, text: string) {
  await waitFor(() => expect(commandsNamed(transport, WATCH_COMMAND)).toHaveLength(1));
  const [watch] = commandsNamed(transport, WATCH_COMMAND);
  const before = commandsNamed(transport, READ_COMMAND).length;
  const size = new TextEncoder().encode(text).length;
  await act(() =>
    watch.events.onData(
      new TextEncoder().encode(`now 1760100060\n1760100000 ${size} ${name}\nend\n`)
    )
  );
  await waitFor(() => expect(commandsNamed(transport, READ_COMMAND)).toHaveLength(before + 1));
  const read = commandsNamed(transport, READ_COMMAND)[before];
  await act(() => {
    read.events.onData(new TextEncoder().encode(`flare-file\n${text}`));
    read.events.onClose();
  });
  return watch;
}

/** The viewer's web view, and what it was given. */
async function page(name: string) {
  const view = await screen.findByLabelText(name);
  return {
    view,
    props: view.props as {
      source: { html: string };
      javaScriptEnabled: boolean;
      onShouldStartLoadWithRequest(request: { url: string; isTopFrame?: boolean }): boolean;
    },
  };
}

describe('files from agents', () => {
  it('brings a file an agent saved to the phone, and shows its Markdown', async () => {
    const { user, transport } = await openSession();

    await sendFile(transport, 'plan.md', '# Plan\n\n- Write the tests\n');

    const banner = await screen.findByRole('button', { name: 'Read plan.md, from Devbox' });
    expect(screen.getByText('Devbox sent a file')).toBeOnTheScreen();
    await user.press(banner);

    const { props } = await page('plan.md');
    expect(props.source.html).toContain('<h1>Plan</h1>');
    expect(props.source.html).toContain('<li>Write the tests</li>');
    expect(props.javaScriptEnabled).toBe(false);
    expect(screen.getByText('From Devbox · 26 B · just now')).toBeOnTheScreen();
    expect(readJson<{ read: boolean }[]>('flare.outbox.v1')?.[0].read).toBe(true);
  });

  it('opens a Markdown file’s links in the browser, and nothing else', async () => {
    const { transport } = await openSession();
    await sendFile(transport, 'plan.md', '[docs](https://expo.dev/)');
    await act(() => router.push('/inbox'));
    await userEvent.setup().press(await screen.findByRole('button', { name: /^Read plan\.md/ }));
    const { props } = await page('plan.md');

    expect(props.onShouldStartLoadWithRequest({ url: 'about:blank', isTopFrame: true })).toBe(true);
    expect(props.onShouldStartLoadWithRequest({ url: 'about:blank#steps' })).toBe(true);
    expect(props.onShouldStartLoadWithRequest({ url: 'tel:123', isTopFrame: true })).toBe(false);
    expect(openBrowser).not.toHaveBeenCalled();

    expect(props.onShouldStartLoadWithRequest({ url: 'https://expo.dev/', isTopFrame: true })).toBe(
      false
    );
    expect(openBrowser).toHaveBeenCalledWith('https://expo.dev/');
  });

  it('shows an HTML page without its scripts until they’re allowed, and asks before a link', async () => {
    const { user, transport } = await openSession();
    await sendFile(transport, 'report.html', '<!doctype html><p>Report</p>');
    await user.press(await screen.findByRole('button', { name: 'Read report.html, from Devbox' }));

    let { props } = await page('report.html');
    expect(props.javaScriptEnabled).toBe(false);
    expect(props.source.html).toContain('Content-Security-Policy');

    await user.press(screen.getByRole('switch', { name: 'Run scripts' }));
    ({ props } = await page('report.html'));
    expect(props.javaScriptEnabled).toBe(true);
    expect(props.source.html).not.toContain('Content-Security-Policy');

    // A page can change address on its own: the person decides.
    await act(() => props.onShouldStartLoadWithRequest({ url: 'https://example.com/x' }));
    expect(openBrowser).not.toHaveBeenCalled();
    expect(screen.getByText('https://example.com/x')).toBeOnTheScreen();
    await user.press(
      screen.getByRole('button', { name: 'Open https://example.com/x in the browser' })
    );
    expect(openBrowser).toHaveBeenCalledWith('https://example.com/x');
  });

  it('lists files in the inbox, and deletes the phone’s copy without fetching it again', async () => {
    const { user, transport } = await openSession();
    const watch = await sendFile(transport, 'plan.md', '# Plan');
    await act(() => router.push('/inbox'));

    expect(await screen.findByText('Files from agents · 1')).toBeOnTheScreen();
    expect(screen.getByText('1 new file', { exact: false })).toBeOnTheScreen();
    await user.press(
      screen.getByRole('button', { name: 'Read plan.md, new, Devbox, 6 B, just now' })
    );
    await page('plan.md');
    await user.press(screen.getByRole('button', { name: 'Delete from this phone' }));
    await user.press(await screen.findByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeOnTheScreen();
    expect(screen.queryByText(/^Files from agents/)).not.toBeOnTheScreen();
    const reads = commandsNamed(transport, READ_COMMAND).length;
    await act(() =>
      watch.events.onData(new TextEncoder().encode('now 1760100065\n1760100000 6 plan.md\nend\n'))
    );
    expect(commandsNamed(transport, READ_COMMAND)).toHaveLength(reads);
  });

  it('notifies while the app is in the background, and the notification opens the file', async () => {
    const { transport } = await openSession();
    await act(() => appStateListeners.forEach((listener) => listener('background')));

    await sendFile(transport, 'plan.md', '# Plan');

    expect(postedFiles).toEqual([
      {
        connectionId: 'devbox',
        title: 'Devbox sent a file',
        body: 'plan.md',
        fileId: expect.any(String),
      },
    ]);
    await act(() => tapFile(postedFiles[0]));
    expect((await page('plan.md')).props.source.html).toContain('<h1>Plan</h1>');
  });

  it('keeps a protected connection’s file names out of notifications and lists', async () => {
    const { transport } = await openSession({ connection: { ...DEVBOX, protected: true } });
    await act(() => appStateListeners.forEach((listener) => listener('background')));

    await sendFile(transport, 'acquisition.md', '# Secret');

    expect(postedFiles[0]).toMatchObject({
      title: 'Devbox sent a file',
      body: 'Open Flare to read it',
    });
    await act(() => router.push('/inbox'));
    expect(
      await screen.findByRole('button', { name: /^Read A file, new, Devbox/ })
    ).toBeOnTheScreen();
    expect(screen.queryByText('acquisition.md')).not.toBeOnTheScreen();
  });

  it('asks for the lock before showing a protected connection’s file', async () => {
    const vault = new Vault({ cost: { N: 2 ** 10, r: 8, p: 1 } });
    await vault.create('pin', '123456');
    vault.close();
    writeJson('flare.connections.v1', [{ ...DEVBOX, protected: true }]);
    const user = userEvent.setup();
    await renderApp('/');
    const unlock = async () => {
      await user.type(await screen.findByLabelText('PIN'), '123456');
      await user.press(screen.getByRole('button', { name: 'Unlock' }));
    };
    await unlock();
    await user.press(screen.getByRole('button', { name: 'Open Devbox' }));
    await unlock();
    await act(() => transports[0].status({ state: 'connected' }));

    await sendFile(transports[0], 'acquisition.md', '# Secret');
    // The banner keeps its name behind the lock too.
    expect(await screen.findByText('Unlock to read it')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Read the file from Devbox' }));

    expect(await screen.findByRole('heading', { name: 'Unlock this file' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('acquisition.md')).not.toBeOnTheScreen();
    await unlock();
    expect((await page('acquisition.md')).props.source.html).toContain('<h1>Secret</h1>');
  });

  it('runs nothing on the host when turned off in Settings', async () => {
    writeJson('flare.preferences.v1', { outbox: false });
    const { transport } = await openSession();

    expect(await screen.findByRole('button', { name: 'Close session' })).toBeOnTheScreen();
    expect(commandsNamed(transport, WATCH_COMMAND)).toEqual([]);
  });

  it('has a switch in Settings', async () => {
    await renderApp('/settings');

    const toggle = await screen.findByRole('switch', { name: 'Files from agents' });
    expect(toggle).toBeChecked();
    await userEvent.setup().press(toggle);
    expect(toggle).not.toBeChecked();
    expect(readJson('flare.preferences.v1')).toMatchObject({ outbox: false });
  });

  it('offers to ask an agent to send its result to the phone', async () => {
    const { user } = await openSession({ shortcut: true });
    await fireEvent(screen.getByRole('button', { name: 'Hide keyboard' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'up' },
    });
    const field = await screen.findByLabelText('Command');

    await user.type(field, 'Write up the plan');
    await user.press(screen.getByRole('button', { name: 'Send to my phone' }));

    expect(field).toHaveDisplayValue(`Write up the plan. ${SEND_TO_PHONE_PROMPT}`);
    expect(screen.queryByRole('button', { name: 'Send to my phone' })).not.toBeOnTheScreen();
  });
});
