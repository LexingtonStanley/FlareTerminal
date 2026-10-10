import { act, fireEvent, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import { READ_CONFIG_COMMAND } from '@/features/connections/read-ssh-config';
import { Vault } from '@/features/vault/vault';
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

const mockClipboard = { text: '' };
jest.mock('expo-clipboard', () => ({
  getStringAsync: async () => mockClipboard.text,
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

const CONFIG = [
  'Host lexbox',
  '  HostName 100.101.102.103',
  '  User lexde',
  '',
  'Host pi',
  '  Port 2222',
  '',
  'Host prod',
  '  ProxyJump bastion',
].join('\n');

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
  mockClipboard.text = '';
});

const saved = () => readJson<Connection[]>('flare.connections.v1') ?? [];

describe('importing from an SSH config', () => {
  it('adds the hosts pasted from a config', async () => {
    writeJson('flare.groups.v1', [{ id: 'home', name: 'Home lab', protected: false }]);
    mockClipboard.text = CONFIG;
    const app = await renderApp('/');
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'New connection' }));
    await user.press(await screen.findByRole('button', { name: 'Import from SSH config' }));
    await user.press(await screen.findByRole('button', { name: 'Paste' }));

    expect(await screen.findByText('Hosts · 3')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'lexbox' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'pi' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'prod' })).not.toBeChecked();
    expect(
      screen.getByText('prod · Reached through bastion, which isn’t saved or here to add')
    ).toBeOnTheScreen();
    expect(screen.getByText('pi:2222')).toBeOnTheScreen();

    // pi names no User: the person gives one.
    await user.press(screen.getByRole('button', { name: 'Add 2 connections' }));
    expect(
      screen.getByText('Enter the username for the hosts that don’t name one')
    ).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Username'), 'pi');
    expect(screen.getByText('pi@pi:2222')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'Home lab' }));
    await user.press(screen.getByRole('button', { name: 'Add 2 connections' }));

    await waitFor(() => expect(app).toHavePathname('/'));
    expect(await screen.findByRole('button', { name: 'Open lexbox' })).toBeOnTheScreen();
    expect(
      saved().map(({ name, groupId, ...rest }) => [
        name,
        groupId,
        rest.kind === 'ssh' ? `${rest.username}@${rest.host}:${rest.port}` : null,
      ])
    ).toEqual([
      ['lexbox', 'home', 'lexde@100.101.102.103:22'],
      ['pi', 'home', 'pi@pi:2222'],
    ]);
  });

  it('marks hosts already saved, and adds one only when ticked', async () => {
    writeJson('flare.connections.v1', [
      { ...DEVBOX, id: 'lexbox', name: 'Lexbox', host: '100.101.102.103', username: 'lexde' },
    ]);
    await renderApp('/connections/import');
    const user = userEvent.setup();

    await fireEvent.changeText(await screen.findByLabelText('Paste it'), CONFIG);

    expect(screen.getByText('lexde@100.101.102.103 · Already saved')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'lexbox' })).not.toBeChecked();
    await user.press(screen.getByRole('switch', { name: 'pi' }));
    await user.press(screen.getByRole('switch', { name: 'prod' }));
    expect(screen.getByRole('switch', { name: 'pi' })).not.toBeChecked();
    expect(screen.getByText('For the host that doesn’t name a User')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Username'), 'ops');

    await user.press(screen.getByRole('button', { name: 'Add 1 connection' }));
    await waitFor(() => expect(saved().map(({ name }) => name)).toEqual(['Lexbox', 'prod']));
  });

  it('adds a host with the jump host it goes through', async () => {
    await renderApp('/connections/import');
    const user = userEvent.setup();
    await fireEvent.changeText(
      await screen.findByLabelText('Paste it'),
      [
        'Host bastion',
        '  HostName jump.example.com',
        '  User ec2-user',
        'Host web',
        '  HostName 10.0.1.5',
        '  User deploy',
        '  ProxyJump bastion',
      ].join('\n')
    );

    expect(screen.getByText('deploy@10.0.1.5 · Through bastion')).toBeOnTheScreen();
    // Leaving out the jump host leaves out what goes through it, and back.
    await user.press(screen.getByRole('switch', { name: 'bastion' }));
    expect(screen.getByRole('switch', { name: 'web' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Add connections' })).toBeDisabled();
    await user.press(screen.getByRole('switch', { name: 'web' }));
    expect(screen.getByRole('switch', { name: 'bastion' })).toBeChecked();

    await user.press(screen.getByRole('button', { name: 'Add 2 connections' }));

    await waitFor(() => expect(saved()).toHaveLength(2));
    const [bastion, web] = saved();
    expect(web).toMatchObject({ name: 'web', host: '10.0.1.5', jumpId: bastion.id });
    expect(bastion).toMatchObject({ name: 'bastion', host: 'jump.example.com', jumpId: null });
  });

  it('says what it skipped', async () => {
    await renderApp('/connections/import');
    await fireEvent.changeText(
      await screen.findByLabelText('Paste it'),
      'Include config.d/*\nMatch host lexbox\n  User ada'
    );

    expect(screen.getByText('Hosts · 0')).toBeOnTheScreen();
    expect(screen.getByText(/Hosts in files named by Include lines aren’t here/)).toBeOnTheScreen();
    expect(screen.getByText(/Match blocks are skipped/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add connections' })).toBeDisabled();
  });

  it('reads the config on a computer it’s connected to', async () => {
    writeJson('flare.connections.v1', [DEVBOX]);
    const app = await renderApp('/');
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Open Devbox' }));
    const transport = transports[0];
    await act(() => transport.status({ state: 'connected' }));

    await act(() => router.push('/connections/import'));
    await user.press(await screen.findByRole('button', { name: 'Read ~/.ssh/config on Devbox' }));

    // The host's side: the script names its marker; the config comes after it.
    const reads = () => transport.commands.filter(({ command }) => command === READ_CONFIG_COMMAND);
    await waitFor(() => expect(reads()).toHaveLength(1));
    const [read] = reads();
    await waitFor(() => expect(read.sent).toHaveLength(1));
    const marker = /echo "(flare-[0-9a-f]+) end"/.exec(read.sent[0])![1];
    await act(() => {
      read.events.onData(new TextEncoder().encode(`${marker} 0\n${CONFIG}\n${marker} end\n`));
      read.events.onClose();
    });

    expect(await screen.findByText('Hosts on Devbox · 3')).toBeOnTheScreen();
    // Without a User, OpenSSH there signs in as the person: Devbox's username.
    expect(screen.getByLabelText('Username')).toHaveDisplayValue('ada');
    expect(screen.getByText('ada@pi:2222')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add 2 connections' }));

    await waitFor(() => expect(app).toHavePathname('/'));
    expect(saved().map(({ name }) => name)).toEqual(['Devbox', 'lexbox', 'pi']);
    expect(saved()[2]).toMatchObject({ host: 'pi', port: 2222, username: 'ada' });
  });

  it('says when the computer has no config', async () => {
    writeJson('flare.connections.v1', [DEVBOX]);
    await renderApp('/');
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Open Devbox' }));
    const transport = transports[0];
    await act(() => transport.status({ state: 'connected' }));
    await act(() => router.push('/connections/import'));

    await user.press(await screen.findByRole('button', { name: 'Read ~/.ssh/config on Devbox' }));
    const read = await waitFor(() => {
      const found = transport.commands.find(({ command }) => command === READ_CONFIG_COMMAND);
      expect(found?.sent).toHaveLength(1);
      return found!;
    });
    const marker = /echo "(flare-[0-9a-f]+) end"/.exec(read.sent[0])![1];
    await act(() => {
      read.events.onData(new TextEncoder().encode(`${marker} end\n`));
      read.events.onClose();
    });

    expect(await screen.findByText('Devbox has no ~/.ssh/config.')).toBeOnTheScreen();
  });

  it('keeps a protected connection’s computer behind the lock', async () => {
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

    await act(() => router.push('/connections/import'));

    expect(await screen.findByLabelText('Paste it')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Read ~/.ssh/config on Devbox' })).toBeNull();
  });
});
