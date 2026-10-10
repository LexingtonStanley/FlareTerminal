import { act, fireEvent, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
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

const DEVBOX: Connection = {
  id: 'devbox',
  kind: 'ssh',
  name: 'Devbox',
  host: 'devbox',
  port: 22,
  username: 'ada',
};

const agentShortcut = (harness: string) => ({
  id: 'janus',
  name: 'Janus',
  connectionId: 'devbox',
  command: `cd ~/agents/janus && tmux new -A -s Janus ${harness} \\; set -q mouse on`,
  directory: '~/agents/janus',
  group: 'Agents',
  agent: { harness, session: 'tmux', skipPermissions: false, commandEdited: false },
  confirm: false,
});

const PROMPTS_KEY = 'flare.prompts.v1';

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
});

/** Opens the agent shortcut (or the bare connection) and writes with the phone's keyboard. */
async function write(shortcut?: ReturnType<typeof agentShortcut>) {
  writeJson('flare.connections.v1', [DEVBOX]);
  writeJson('flare.shortcuts.v1', shortcut ? [shortcut] : []);
  await renderApp('/');
  const user = userEvent.setup();
  const name = shortcut ? `Run ${shortcut.name}` : 'Open Devbox';
  await user.press(await screen.findByRole('button', { name }));
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  await fireEvent(screen.getByRole('button', { name: 'Hide keyboard' }), 'accessibilityAction', {
    nativeEvent: { actionName: 'up' },
  });
  return { user, transport, field: await screen.findByLabelText('Command') };
}

const chip = (name: string | RegExp) => screen.getByRole('button', { name });

describe('slash commands', () => {
  it('fills the field with the agent’s command, which Send sends', async () => {
    const { user, transport, field } = await write(agentShortcut('claude'));
    transport.written.splice(0);

    await user.press(chip(/^\/compact, /));
    expect(field).toHaveDisplayValue('/compact');
    // A chip never sends by itself.
    expect(transport.written).toEqual([]);
    expect(screen.getByText('Summarize to free up context')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Send' }));
    expect(transport.written).toEqual(['/compact', '\r']);
  });

  it('narrows as the person writes a command', async () => {
    const { user, field } = await write(agentShortcut('claude'));

    await user.type(field, '/re');

    expect(chip(/^\/resume, /)).toBeOnTheScreen();
    expect(chip(/^\/review, /)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^\/compact, / })).not.toBeOnTheScreen();
  });

  it('offers each agent its own commands', async () => {
    await write(agentShortcut('hermes'));

    expect(chip(/^\/compress, /)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^\/compact, / })).not.toBeOnTheScreen();
  });

  it('offers none on a plain connection, which isn’t an agent', async () => {
    await write();

    expect(screen.queryByRole('button', { name: /^\/compact, / })).not.toBeOnTheScreen();
    expect(screen.getByText('Prompts you save show here')).toBeOnTheScreen();
  });

  it('hides suggestions while the host asks for a password', async () => {
    const { transport } = await write(agentShortcut('claude'));

    await act(() => transport.inputMode('secret'));

    expect(screen.queryByRole('button', { name: /^\/compact, / })).not.toBeOnTheScreen();
    expect(screen.getByText('Hidden while typing a password')).toBeOnTheScreen();
  });
});

describe('saved prompts', () => {
  it('saves what was written, and offers it again next time', async () => {
    const { user, transport, field } = await write(agentShortcut('codex'));

    await user.type(field, 'Run the tests and fix what fails');
    await user.press(chip('Save as prompt'));
    expect(screen.getByText('Saved in your prompts')).toBeOnTheScreen();
    expect(readJson(PROMPTS_KEY)).toEqual([
      { id: expect.any(String), text: 'Run the tests and fix what fails' },
    ]);
    // Saving doesn't send or clear it.
    expect(field).toHaveDisplayValue('Run the tests and fix what fails');
    await user.press(screen.getByRole('button', { name: 'Send' }));
    transport.written.splice(0);

    await user.press(chip('Run the tests and fix what fails'));
    expect(field).toHaveDisplayValue('Run the tests and fix what fails');
    await user.press(screen.getByRole('button', { name: 'Send' }));
    expect(transport.written).toEqual(['Run the tests and fix what fails', '\r']);
  });

  it('are listed in Settings, where they’re added and deleted', async () => {
    writeJson(PROMPTS_KEY, [{ id: 'a', text: 'Commit and push' }]);
    const user = userEvent.setup();
    await renderApp('/settings');

    expect(await screen.findByText('Commit and push')).toBeOnTheScreen();
    const add = screen.getByRole('button', { name: 'Add prompt' });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('New prompt'), 'Commit and push');
    // Saved already.
    expect(add).toBeDisabled();
    await user.clear(screen.getByLabelText('New prompt'));
    await user.type(screen.getByLabelText('New prompt'), 'Open a draft PR');
    await user.press(add);
    expect(screen.getByText('Open a draft PR')).toBeOnTheScreen();
    expect(screen.getByLabelText('New prompt')).toHaveDisplayValue('');

    await user.press(screen.getByRole('button', { name: 'Delete Commit and push' }));
    expect(screen.getByText('Delete this prompt?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('Commit and push')).not.toBeOnTheScreen();
    expect(readJson(PROMPTS_KEY)).toEqual([{ id: expect.any(String), text: 'Open a draft PR' }]);
  });

  it('can be turned off, giving the terminal the strip’s room', async () => {
    const user = userEvent.setup();
    writeJson('flare.connections.v1', [DEVBOX]);
    writeJson('flare.shortcuts.v1', [agentShortcut('claude')]);
    await renderApp('/settings');

    await user.press(await screen.findByRole('switch', { name: 'Suggestions while writing' }));
    await act(() => router.replace('/'));
    await user.press(await screen.findByRole('button', { name: 'Run Janus' }));
    await act(() => transports[0].status({ state: 'connected' }));
    await fireEvent(screen.getByRole('button', { name: 'Hide keyboard' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'up' },
    });

    expect(await screen.findByLabelText('Command')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^\/compact, / })).not.toBeOnTheScreen();
    expect(screen.queryByText('Prompts you save show here')).not.toBeOnTheScreen();
  });
});
