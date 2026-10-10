import { act, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import { HEALTH_SCRIPT } from '@/features/health/health';
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

/** A reading as the script prints it: 95% of memory and 30% of the disk in use. */
const READING = [
  'load 0.42 0.67 0.63',
  'uptime 93600',
  'cpus 4',
  'memkb 16777216 838861',
  'diskkb 488281250 146484375 341796875',
  'end\n',
].join('\n');

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
});

async function openSession(connection: Connection = DEVBOX) {
  writeJson('flare.connections.v1', [connection]);
  await renderApp('/');
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: `Open ${connection.name}` }));
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  return { user, transport };
}

/** The health strip's commands (the outbox's run beside them, named `sh -s flare-outbox`). */
const healthCommands = (transport: FakeTransport) =>
  transport.commands.filter(({ command }) => command === 'sh -s');

/** The host's side of the health command, once the app has started it. */
async function healthCommand(transport: FakeTransport) {
  await waitFor(() => expect(healthCommands(transport)).toHaveLength(1));
  const [command] = healthCommands(transport);
  await waitFor(() => expect(command.sent).toEqual([HEALTH_SCRIPT]));
  return command;
}

describe('host health strip', () => {
  it('shows the host’s load, memory, disk and uptime from one command', async () => {
    const { user, transport } = await openSession();
    const command = await healthCommand(transport);

    await act(() => command.events.onData(new TextEncoder().encode(READING)));

    const strip = await screen.findByRole('button', { name: /^Host health:/ });
    expect(strip).toHaveAccessibleName(
      'Host health: load 0.42 on 4 cores, memory 95% used, disk 30% used, up 1d. High: mem'
    );
    await user.press(strip);
    expect(
      screen.getByText('load 0.42 0.67 0.63 · 4 cores · mem 15 GB of 16 GB · disk 140 GB of 466 GB')
    ).toBeOnTheScreen();
  });

  it('stops the command when the session’s screen closes', async () => {
    const { transport } = await openSession();
    const command = await healthCommand(transport);

    await act(() => router.back());

    await waitFor(() => expect(command.closed).toBe(true));
    expect(transport.closed).toBe(false);
  });

  it('starts again after a reconnect, and hides while disconnected', async () => {
    const { transport } = await openSession();
    const command = await healthCommand(transport);
    await act(() => command.events.onData(new TextEncoder().encode(READING)));
    expect(await screen.findByRole('button', { name: /^Host health:/ })).toBeOnTheScreen();

    await act(() => transport.status({ state: 'closed', message: 'Connection lost', retry: true }));

    expect(screen.queryByRole('button', { name: /^Host health:/ })).not.toBeOnTheScreen();
    await waitFor(() => expect(transports).toHaveLength(2), { timeout: 3000 });
    await act(() => transports[1].status({ state: 'connected' }));
    await healthCommand(transports[1]);
  });

  it('runs nothing when turned off in Settings', async () => {
    writeJson('flare.preferences.v1', { hostHealth: false });
    const { transport } = await openSession();

    expect(await screen.findByRole('button', { name: 'Close session' })).toBeOnTheScreen();
    expect(healthCommands(transport)).toEqual([]);
  });

  it('has a switch in Settings', async () => {
    await renderApp('/settings');

    const toggle = await screen.findByRole('switch', { name: 'Host health' });
    expect(toggle).toBeChecked();
    await userEvent.setup().press(toggle);
    expect(toggle).not.toBeChecked();
  });
});
