import { act, userEvent, waitFor } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import { readingScript } from '@/features/reading/capture';
import { READ_TIMEOUT_MS } from '@/features/reading/use-history';
import { transports, type FakeCommand, type FakeTransport } from '@/test-utils/fake-transport';
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

const mockClipboard = { text: '' };
jest.mock('expo-clipboard', () => ({
  setStringAsync: async (text: string) => {
    mockClipboard.text = text;
    return true;
  },
}));

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
  command: 'cd ~/agents/janus && tmux new -A -s Janus claude \\; set -q mouse on',
  directory: '~/agents/janus',
  group: 'Agents',
  agent: { harness: 'claude', session: 'tmux', skipPermissions: false, commandEdited: false },
};

/** What Claude Code wrote, as tmux prints its history: colours, and a tool call's output. */
const HISTORY = [
  '\x1b[48;5;237m> fix the failing test\x1b[0m',
  '',
  "\x1b[38;2;215;119;87m⏺\x1b[0m I'll run the tests first.",
  '',
  '\x1b[32m⏺\x1b[0m \x1b[1mBash\x1b[22m(npm test)',
  '  ⎿  PASS src/a.test.ts',
  '     PASS src/b.test.ts',
  '     FAIL src/c.test.ts',
  '     Tests: 1 failed, 2 passed',
  '',
  '⏺ The test in c.test.ts expects the old name.',
  '',
].join('\n');

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
  mockClipboard.text = '';
});

async function openSession({
  connection = DEVBOX,
  shortcut,
}: { connection?: Connection; shortcut?: typeof JANUS } = {}) {
  writeJson('flare.connections.v1', [connection]);
  writeJson('flare.shortcuts.v1', shortcut ? [shortcut] : []);
  await renderApp('/');
  const user = userEvent.setup();
  const name = shortcut ? `Run ${shortcut.name}` : `Open ${connection.name}`;
  await user.press(await screen.findByRole('button', { name }));
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  return { user, transport };
}

/** The reading command, once the app has sent its script (the health strip runs another). */
async function readingCommand(transport: FakeTransport, after = 0): Promise<FakeCommand> {
  let found: FakeCommand | undefined;
  await waitFor(() => {
    found = transport.commands
      .slice(after)
      .find((command) => command.sent.join('').startsWith('echo flare-sessions'));
    expect(found).toBeDefined();
  });
  return found!;
}

/** The host prints `output` and the command ends. */
async function answer(command: FakeCommand, output: string) {
  await act(async () => {
    command.events.onData(new TextEncoder().encode(output));
    command.events.onClose();
  });
}

describe('reading mode', () => {
  it('reads an agent’s whole tmux history, offered after a swipe back', async () => {
    const { user, transport } = await openSession({ shortcut: JANUS });

    await user.press(screen.getByRole('button', { name: 'Swipe back' }));
    await user.press(await screen.findByRole('button', { name: 'Open reading mode' }));

    const command = await readingCommand(transport);
    expect(command.command).toBe('sh -s');
    expect(command.sent.join('')).toBe(readingScript({ kind: 'tmux', session: 'Janus' }));
    expect(await screen.findByText('Reading tmux · Janus…')).toBeOnTheScreen();

    await answer(command, `flare-sessions\ntmux Janus\nflare-history\n${HISTORY}`);

    expect(await screen.findByText('11 lines from tmux · Janus')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'tmux · Janus' })).toBeChecked();
    expect(screen.getByText('> fix the failing test')).toBeOnTheScreen();
    expect(screen.getByText(/expects the old name/)).toBeOnTheScreen();
    // The tool's output folds to its first lines.
    expect(screen.getByText(/PASS src\/a\.test\.ts/)).toBeOnTheScreen();
    expect(screen.queryByText(/Tests: 1 failed/)).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Show 2 more lines' }));
    expect(screen.getByText(/Tests: 1 failed/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeExpanded();

    await user.press(screen.getByRole('button', { name: 'Copy all as Markdown' }));
    expect(mockClipboard.text).toBe(
      [
        '> fix the failing test',
        '',
        "I'll run the tests first.",
        '',
        '**Bash(npm test)**',
        '',
        '```',
        'PASS src/a.test.ts',
        'PASS src/b.test.ts',
        'FAIL src/c.test.ts',
        'Tests: 1 failed, 2 passed',
        '```',
        '',
        'The test in c.test.ts expects the old name.',
      ].join('\n')
    );
    expect(await screen.findByRole('button', { name: 'Copied as Markdown' })).toBeOnTheScreen();
  });

  it('shows the screen of a plain session, and reads a session picked from the host’s', async () => {
    const { user, transport } = await openSession();
    await act(() => transport.output('ada@devbox:~$ uptime\r\n 10:00 up 3 days\r\nada@devbox:~$ '));

    await user.press(screen.getByRole('button', { name: 'Swipe back' }));
    await user.press(await screen.findByRole('button', { name: 'Open reading mode' }));
    const listing = await readingCommand(transport);
    expect(listing.sent.join('')).toBe(readingScript(null));
    await answer(listing, 'flare-sessions\ntmux main\nzellij Janus\n');

    expect(
      await screen.findByText(
        '3 lines from this screen. Pick a session to read all of its history.'
      )
    ).toBeOnTheScreen();
    expect(screen.getByText('10:00 up 3 days', { exact: false })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'This screen' })).toBeChecked();

    const before = transport.commands.length;
    await user.press(screen.getByRole('radio', { name: 'zellij · Janus' }));
    const zellij = await readingCommand(transport, before);
    expect(zellij.sent.join('')).toBe(readingScript({ kind: 'zellij', session: 'Janus' }));
    await answer(zellij, 'flare-sessions\ntmux main\nzellij Janus\nflare-history\nfrom zellij\n');

    expect(await screen.findByText('1 line from zellij · Janus')).toBeOnTheScreen();
    expect(screen.getByText('from zellij')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'zellij · Janus' })).toBeChecked();
  });

  it('says so when the session it should read is gone, and shows the screen', async () => {
    const { user, transport } = await openSession({ shortcut: JANUS });
    await act(() => transport.output('[exited]\r\n'));

    await user.press(screen.getByRole('button', { name: 'Swipe back' }));
    await user.press(await screen.findByRole('button', { name: 'Open reading mode' }));
    await answer(await readingCommand(transport), 'flare-sessions\n');

    expect(
      await screen.findByText('Couldn’t read tmux · Janus, so this is the screen (1 line).')
    ).toBeOnTheScreen();
  });

  it('reads the screen when the host doesn’t answer', async () => {
    jest.useFakeTimers();
    try {
      const { transport } = await openSession({ shortcut: JANUS });
      await act(() => transport.output('still here\r\n'));
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.press(screen.getByRole('button', { name: 'Swipe back' }));
      await user.press(await screen.findByRole('button', { name: 'Open reading mode' }));
      const command = await readingCommand(transport);

      await act(() => jest.advanceTimersByTime(READ_TIMEOUT_MS));

      expect(command.closed).toBe(true);
      expect(
        await screen.findByText('The host didn’t answer, so this is the screen (1 line).')
      ).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('is offered when a swipe can’t scroll a full-screen program', async () => {
    const { user, transport } = await openSession({ shortcut: JANUS });

    await user.press(screen.getByRole('button', { name: 'Swipe on a full-screen program' }));
    expect(screen.getByText('This program keeps its history to itself')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open reading mode' }));

    await readingCommand(transport);
    expect(await screen.findByText('Reading tmux · Janus…')).toBeOnTheScreen();
  });

  it('over ttyd, reads the screen and says tmux’s history needs SSH', async () => {
    const ttyd: Connection = {
      id: 'devbox',
      kind: 'ttyd',
      name: 'Devbox',
      url: 'devbox:7681',
      username: '',
    };
    const { user, transport } = await openSession({ connection: ttyd, shortcut: JANUS });
    await act(() => transport.output('tmux screen\r\n'));

    await user.press(screen.getByRole('button', { name: 'Swipe back' }));
    await user.press(await screen.findByRole('button', { name: 'Open reading mode' }));

    expect(
      await screen.findByText(
        'Reading tmux’s own history needs an SSH connection, so this is the screen (1 line).'
      )
    ).toBeOnTheScreen();
    expect(screen.getByText('tmux screen')).toBeOnTheScreen();
  });
});
