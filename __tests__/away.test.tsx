import { act, fireEvent, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import { transports, type FakeTransport } from '@/test-utils/fake-transport';
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

const JANUS = {
  id: 'janus',
  name: 'Janus',
  connectionId: 'devbox',
  command: 'cd ~/agents/janus && tmux new -A -s Janus claude \\; set -q mouse on',
  directory: '~/agents/janus',
  group: 'Agents',
  agent: { harness: 'claude', session: 'tmux', skipPermissions: false, commandEdited: false },
};

const numbered = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `line ${from + i}\r\n`).join('');

/** A screen as tmux draws it: its pane, then its status line on the last row. */
const tmuxScreen = (lines: string[]) =>
  `\x1b[H\x1b[2J${lines.join('\r\n')}\x1b[24;1H[Janus] 0:claude*  "devbox" 14:05`;

// Claude Code at work in tmux, as the person leaves, and once it's done.
const BEFORE = [
  '> fix the failing test',
  '',
  "⏺ I'll run the tests first.",
  '',
  '⏺ Bash(npm test)',
  '  ⎿  Running…',
  '',
  '✻ Thinking… (esc to interrupt)',
  '> ',
  '  ? for shortcuts',
];
const AFTER = [
  '⏺ Bash(npm test)',
  '  ⎿  PASS src/a.test.ts',
  '     FAIL src/c.test.ts',
  '',
  '⏺ The test in c.test.ts expects the old name.',
  '> ',
];
// What tmux kept: everything Claude Code wrote, then its screen now.
const HISTORY = [
  '> fix the failing test',
  '',
  "⏺ I'll run the tests first.",
  '',
  '⏺ Bash(npm test)',
  '  ⎿  PASS src/a.test.ts',
  '     FAIL src/c.test.ts',
  '',
  '⏺ The test in c.test.ts expects the old name.',
  '> ',
].join('\n');

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
});

async function openSession(shortcut?: typeof JANUS) {
  writeJson('flare.connections.v1', [DEVBOX]);
  writeJson('flare.shortcuts.v1', shortcut ? [shortcut] : []);
  await renderApp('/');
  const user = userEvent.setup();
  const name = shortcut ? `Run ${shortcut.name}` : 'Open Devbox';
  await user.press(await screen.findByRole('button', { name }));
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  return { user, transport };
}

/** Leaves the session for a minute, during which the host writes `output`. */
async function away(transport: FakeTransport, output: string) {
  // Jest renders the native stack header, which has no back button to press.
  await act(() => router.back());
  // renderRouter fakes the clock: move it on without running a minute of timers.
  jest.setSystemTime(Date.now() + 60_000);
  await act(() => transport.output(output));
}

describe('while you were away', () => {
  it('says how many lines arrived, and jumps back to where the person left off', async () => {
    const { user, transport } = await openSession();
    await act(() => transport.output(numbered(0, 5)));

    await away(transport, numbered(5, 40));
    await user.press(screen.getByRole('button', { name: 'Resume Devbox' }));

    const chip = await screen.findByRole('button', {
      name: 'Jump to 40 new lines since you left',
    });
    expect(screen.getByText('40 new lines')).toBeOnTheScreen();
    await user.press(chip);

    // Line 5 was next when they left; the screen starts two lines above it, at line 3:
    // 19 lines above the bottom screen (46 lines on a 24-row screen).
    expect(screen.getByLabelText('Lines scrolled up')).toHaveTextContent('19');
    expect(screen.queryByText('40 new lines')).toBeNull();
  });

  it('goes once the person types or dismisses it', async () => {
    const { user, transport } = await openSession();
    await act(() => transport.output(numbered(0, 5)));
    await away(transport, numbered(5, 40));
    await user.press(screen.getByRole('button', { name: 'Resume Devbox' }));
    expect(await screen.findByText('40 new lines')).toBeOnTheScreen();

    await fireEvent(screen.getByRole('button', { name: 'Escape' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(screen.queryByText('40 new lines')).toBeNull();

    await away(transport, numbered(45, 40));
    await user.press(screen.getByRole('button', { name: 'Resume Devbox' }));
    await user.press(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('40 new lines')).toBeNull();
  });

  it('reads what an agent in tmux wrote, from where the person left off', async () => {
    const { user, transport } = await openSession(JANUS);
    await act(() => transport.output(`\x1b[?1049h${tmuxScreen(BEFORE)}`));

    await away(transport, tmuxScreen(AFTER));
    await user.press(screen.getByRole('button', { name: 'Resume Janus' }));
    await user.press(await screen.findByRole('button', { name: 'Read what’s new since you left' }));

    let command: FakeTransport['commands'][number] | undefined;
    await waitFor(() => {
      command = transport.commands.find(({ sent }) => sent.join('').startsWith('echo flare'));
      expect(command).toBeDefined();
    });
    await act(async () => {
      command!.events.onData(
        new TextEncoder().encode(`flare-sessions\ntmux Janus\nflare-history\n${HISTORY}\n`)
      );
      command!.events.onClose();
    });

    // From the tool call that was running when they left.
    expect(await screen.findByText('6 lines from tmux · Janus since you left')).toBeOnTheScreen();
    expect(screen.getByText(/FAIL src\/c\.test\.ts/)).toBeOnTheScreen();
    expect(screen.getByText(/expects the old name/)).toBeOnTheScreen();
    expect(screen.queryByText(/I'll run the tests first/)).toBeNull();

    await user.press(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByText('10 lines from tmux · Janus')).toBeOnTheScreen();
    expect(screen.getByText(/I'll run the tests first/)).toBeOnTheScreen();

    // It's been read: back on the terminal, the chip has gone.
    await act(() => router.back());
    expect(screen.queryByText('Read what’s new')).toBeNull();
  });
});
