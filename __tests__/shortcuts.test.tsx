import { act, userEvent } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import type { Shortcut } from '@/features/shortcuts/shortcuts';
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

const SHORTCUTS_KEY = 'flare.shortcuts.v1';

/** Claude Code in zellij in ~/agents/janus, skipping permission prompts. */
const JANUS =
  `mkdir -p ~/.config/zellij/layouts && ` +
  `echo 'layout { pane command="claude" { args "--dangerously-skip-permissions"; }; }' ` +
  `> ~/.config/zellij/layouts/flare-janus.kdl && ` +
  `cd ~/agents/janus && ` +
  `if zellij ls -s 2>/dev/null | grep -qx Janus; then zellij attach Janus; ` +
  `else zellij -s Janus -n flare-janus; fi`;

/** Starts the app with saved connections and shortcuts, as if from a previous launch. */
function saved(connections: Connection[], shortcuts: unknown[] = []) {
  writeJson('flare.connections.v1', connections);
  writeJson(SHORTCUTS_KEY, shortcuts);
}

const agentShortcut = (fields: Partial<Shortcut>): Shortcut => ({
  id: 'janus',
  name: 'Janus',
  connectionId: 'devbox',
  command: 'cd ~/agents/janus && tmux new -A -s Janus claude',
  directory: '~/agents/janus',
  group: 'Agents',
  agent: { harness: 'claude', session: 'tmux', skipPermissions: false, commandEdited: false },
  ...fields,
});

async function runShortcut(name: string) {
  await userEvent.setup().press(await screen.findByRole('button', { name: `Run ${name}` }));
  const transport = transports.at(-1)!;
  await act(() => transport.status({ state: 'connected' }));
  return transport;
}

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
});

describe('agent shortcuts', () => {
  it('makes the command from a folder, a name and a setup, and runs it with one tap', async () => {
    saved([DEVBOX]);
    const user = userEvent.setup();
    await renderApp('/');

    await user.press(await screen.findByRole('button', { name: 'New shortcut' }));
    expect(await screen.findByRole('radio', { name: 'Agent' })).toBeChecked();
    await user.type(screen.getByLabelText('Folder'), '~/agents/janus');
    await user.type(screen.getByLabelText('Name'), 'Janus');
    expect(screen.getByRole('radio', { name: 'Claude Code' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'zellij' }));
    await user.press(screen.getByRole('switch', { name: 'Skip permission prompts' }));

    expect(screen.getByRole('switch', { name: 'Skip permission prompts' })).toBeChecked();
    expect(screen.getByDisplayValue(JANUS)).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Agents' })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Agents' })).toBeOnTheScreen();
    expect(screen.getByText('Claude Code · Devbox')).toBeOnTheScreen();
    expect(screen.getByText('~/agents/janus')).toBeOnTheScreen();
    const transport = await runShortcut('Janus');

    expect(transport.connection).toEqual(DEVBOX);
    expect(transport.written).toEqual([`${JANUS}\r`]);
    expect(await screen.findByRole('heading', { name: 'Janus' })).toBeOnTheScreen();
  });

  it('uses each agent’s own flag, and says pi has none', async () => {
    saved([DEVBOX]);
    const user = userEvent.setup();
    await renderApp('/shortcuts/new');

    await user.type(await screen.findByLabelText('Name'), 'Ada');
    await user.press(screen.getByRole('switch', { name: 'Skip permission prompts' }));
    await user.press(screen.getByRole('radio', { name: 'Codex' }));
    expect(screen.getByText('--dangerously-bypass-approvals-and-sandbox')).toBeOnTheScreen();
    expect(
      screen.getByDisplayValue(
        'tmux new -A -s Ada codex --dangerously-bypass-approvals-and-sandbox'
      )
    ).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Hermes' }));
    expect(screen.getByDisplayValue('tmux new -A -s Ada hermes --yolo')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'pi' }));
    expect(
      screen.getByText('pi doesn’t ask for permission, so there’s nothing to skip.')
    ).toBeOnTheScreen();
    expect(screen.queryByRole('switch', { name: 'Skip permission prompts' })).not.toBeOnTheScreen();
    expect(screen.getByDisplayValue('tmux new -A -s Ada pi')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'None' }));
    expect(screen.getByDisplayValue('pi')).toBeOnTheScreen();
  });

  it('keeps a command edited by hand, and runs it', async () => {
    saved([DEVBOX], [agentShortcut({})]);
    const user = userEvent.setup();
    await renderApp('/shortcuts/janus');

    const command = await screen.findByDisplayValue(
      'cd ~/agents/janus && tmux new -A -s Janus claude'
    );
    await user.type(command, ' --continue');
    expect(
      screen.getByText('Edited by hand, so the choices above no longer change it.')
    ).toBeOnTheScreen();

    // Changing the setup leaves it alone now.
    await user.press(screen.getByRole('radio', { name: 'zellij' }));
    expect(command).toHaveDisplayValue(
      'cd ~/agents/janus && tmux new -A -s Janus claude --continue'
    );
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(readJson<Shortcut[]>(SHORTCUTS_KEY)?.[0].agent).toEqual({
      harness: 'claude',
      session: 'zellij',
      skipPermissions: false,
      commandEdited: true,
    });
    const transport = await runShortcut('Janus');
    expect(transport.written).toEqual([
      'cd ~/agents/janus && tmux new -A -s Janus claude --continue\r',
    ]);
  });

  it('goes back to the generated command, which follows the setup again', async () => {
    saved(
      [DEVBOX],
      [
        agentShortcut({
          command: 'cd ~/agents/janus && claude --continue',
          agent: {
            harness: 'claude',
            session: 'tmux',
            skipPermissions: false,
            commandEdited: true,
          },
        }),
      ]
    );
    const user = userEvent.setup();
    await renderApp('/shortcuts/janus');

    const command = await screen.findByDisplayValue('cd ~/agents/janus && claude --continue');
    await user.press(screen.getByRole('button', { name: 'Use the generated command' }));

    expect(command).toHaveDisplayValue('cd ~/agents/janus && tmux new -A -s Janus claude');
    expect(
      screen.queryByRole('button', { name: 'Use the generated command' })
    ).not.toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'None' }));
    expect(command).toHaveDisplayValue('cd ~/agents/janus && claude');

    // Typed back to what the setup makes, it's no longer edited by hand.
    await user.type(command, 'x');
    expect(screen.getByRole('button', { name: 'Use the generated command' })).toBeOnTheScreen();
    await user.clear(command);
    await user.type(command, 'cd ~/agents/janus && claude');
    expect(
      screen.queryByRole('button', { name: 'Use the generated command' })
    ).not.toBeOnTheScreen();
  });
});

describe('command shortcuts', () => {
  it('need a name, a connection and a command', async () => {
    saved([DEVBOX, { ...DEVBOX, id: 'other', name: 'Other' }]);
    const user = userEvent.setup();
    await renderApp('/shortcuts/new');

    await user.press(await screen.findByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a name')).toBeOnTheScreen();
    expect(screen.getByText('Choose a connection')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Command' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Enter a name')).toBeOnTheScreen();
    expect(screen.getByText('Choose a connection')).toBeOnTheScreen();
    expect(screen.getByText('Enter a command, or pick one above')).toBeOnTheScreen();
  });

  it('saves a preset in a group of its own, in a folder', async () => {
    saved([DEVBOX]);
    const user = userEvent.setup();
    await renderApp('/shortcuts/new');

    await user.press(await screen.findByRole('radio', { name: 'Command' }));
    // Agents is only the default for agents.
    expect(screen.getByLabelText('Group')).toHaveDisplayValue('');
    await user.press(screen.getByRole('button', { name: 'Use Git pull' }));
    await user.type(screen.getByLabelText('Folder'), '~/code/my app');
    await user.press(screen.getByRole('radio', { name: 'Maintenance' }));
    expect(screen.getByText("cd ~/'code/my app' && git pull --ff-only")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Maintenance' })).toBeOnTheScreen();
    const transport = await runShortcut('Git pull');
    expect(transport.written).toEqual(["cd ~/'code/my app' && git pull --ff-only\r"]);
  });

  it('keeps each kind’s fields when switching between them', async () => {
    saved([DEVBOX]);
    const user = userEvent.setup();
    await renderApp('/shortcuts/new');

    await user.press(await screen.findByRole('radio', { name: 'zellij' }));
    await user.press(screen.getByRole('radio', { name: 'Command' }));
    await user.press(screen.getByRole('button', { name: 'Use Disk space' }));
    await user.press(screen.getByRole('radio', { name: 'Agent' }));

    expect(screen.getByRole('radio', { name: 'zellij' })).toBeChecked();
    expect(screen.getByLabelText('Group')).toHaveDisplayValue('Agents');
    await user.press(screen.getByRole('radio', { name: 'Command' }));
    expect(screen.getByDisplayValue('df -h')).toBeOnTheScreen();
  });

  it('runs shortcuts saved before agents and groups', async () => {
    saved(
      [DEVBOX],
      [
        {
          id: 'old',
          name: 'Claude',
          connectionId: 'devbox',
          command: 'tmux new -A -s claude claude',
          directory: '~/code/flare',
        },
      ]
    );
    const user = userEvent.setup();
    await renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Shortcuts' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Edit shortcut Claude' }));
    expect(await screen.findByRole('radio', { name: 'Command' })).toBeChecked();
    expect(screen.getByText('cd ~/code/flare && tmux new -A -s claude claude')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Save' }));

    const transport = await runShortcut('Claude');
    expect(transport.written).toEqual(['cd ~/code/flare && tmux new -A -s claude claude\r']);
  });
});

describe('Home', () => {
  it('shows shortcuts in their groups, in the order groups first appear', async () => {
    const plain = (id: string, name: string, group: string): Shortcut => ({
      id,
      name,
      connectionId: 'devbox',
      command: 'df -h',
      directory: '',
      group,
      agent: null,
    });
    saved(
      [DEVBOX],
      [
        plain('logs', 'Logs', ''),
        agentShortcut({ id: 'janus', name: 'Janus' }),
        plain('disk', 'Disk space', 'Maintenance'),
        agentShortcut({ id: 'swayze', name: 'Swayze', group: 'agents' }),
      ]
    );
    await renderApp('/');

    await screen.findByRole('button', { name: 'Run Janus' });
    const headings = screen
      .getAllByRole('heading')
      .map((heading) => heading.props.children as string);
    expect(headings).toEqual(['flare', 'Agents', 'Maintenance', 'Shortcuts', 'Connections']);
    for (const name of ['Logs', 'Janus', 'Disk space', 'Swayze']) {
      expect(screen.getByRole('button', { name: `Run ${name}` })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'New shortcut' })).toBeOnTheScreen();
  });
});
