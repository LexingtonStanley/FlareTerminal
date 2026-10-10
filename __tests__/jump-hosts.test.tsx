import { act, userEvent } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import type { Connection, SshConnection } from '@/features/connections/connections';
import { Vault } from '@/features/vault/vault';
import { transports } from '@/test-utils/fake-transport';
import { clearMemoryStorage, readJson, secrets, writeJson } from '@/test-utils/memory-storage';
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

const BASTION: SshConnection = {
  id: 'bastion',
  kind: 'ssh',
  name: 'Bastion',
  host: 'bastion.example.com',
  port: 22,
  username: 'ec2-user',
};

const DB: SshConnection = {
  id: 'db',
  kind: 'ssh',
  name: 'Prod DB',
  host: '10.0.1.5',
  port: 22,
  username: 'deploy',
  jumpId: 'bastion',
};

const saved = (...connections: Connection[]) => writeJson('flare.connections.v1', connections);

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
});

describe('jump hosts', () => {
  it('saves a connection that goes through another, and opens it through that one', async () => {
    saved(BASTION);
    secrets.set('connection.bastion.password', 'bastion-pass');
    const user = userEvent.setup();
    await renderApp('/connections/new');

    await user.type(await screen.findByLabelText('Host'), 'deploy@10.0.1.5');
    expect(screen.getByText('Connects to it directly')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'Bastion' }));
    expect(
      screen.getByText('Connects to Bastion first, then from there to the host above, like ssh -J')
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Save' }));

    const [, connection] = readJson<Connection[]>('flare.connections.v1')!;
    expect(connection).toMatchObject({ host: '10.0.1.5', username: 'deploy', jumpId: 'bastion' });

    expect(await screen.findByText('deploy@10.0.1.5 · via Bastion')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open deploy@10.0.1.5' }));
    const [transport] = transports;
    expect(transport.connection).toEqual(connection);
    expect(transport.jumps).toEqual([{ connection: BASTION, password: 'bastion-pass' }]);
  });

  it('offers only connections that don’t go through this one', async () => {
    saved(BASTION, DB);
    await renderApp('/connections/bastion');

    // Prod DB goes through Bastion, so Bastion can't go through it: nothing to offer.
    expect(await screen.findByLabelText('Host')).toBeOnTheScreen();
    expect(screen.queryByRole('radiogroup', { name: 'Jump host' })).not.toBeOnTheScreen();
  });

  it('warns that deleting a jump host stops what goes through it', async () => {
    saved(BASTION, DB);
    const user = userEvent.setup();
    await renderApp('/connections/bastion');

    await user.press(await screen.findByRole('button', { name: 'Delete connection' }));

    expect(
      screen.getByText(
        'Prod DB goes through this connection, and won’t connect until you choose another jump host for it.'
      )
    ).toBeOnTheScreen();
  });

  it('says why a connection whose jump host was deleted can’t connect', async () => {
    saved(DB);
    const user = userEvent.setup();
    await renderApp('/');

    expect(await screen.findByText('deploy@10.0.1.5 · via a deleted jump host')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open Prod DB' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prod DB’s jump host was deleted. Choose another in its settings.'
    );
    expect(transports).toHaveLength(0);
  });

  it('keeps a connection behind its jump host’s lock', async () => {
    const vault = new Vault({ cost: { N: 2 ** 10, r: 8, p: 1 } });
    await vault.create('pin', '123456');
    vault.close();
    saved({ ...BASTION, protected: true }, DB);
    const user = userEvent.setup();
    await renderApp('/');
    await user.type(await screen.findByLabelText('PIN'), '123456');
    await user.press(screen.getByRole('button', { name: 'Unlock' }));

    await user.press(await screen.findByRole('button', { name: 'Open Prod DB' }));

    expect(await screen.findByRole('heading', { name: 'Unlock Prod DB' })).toBeOnTheScreen();
    expect(
      screen.getByText('It goes through a protected jump host. It stays connected while locked.')
    ).toBeOnTheScreen();
    expect(transports).toHaveLength(0);
    await user.type(screen.getByLabelText('PIN'), '123456');
    await user.press(screen.getByRole('button', { name: 'Unlock' }));
    await act(() => transports[0].status({ state: 'connected' }));
    expect(await screen.findByLabelText('Status: Connected')).toBeOnTheScreen();
  });

  it('shows that a protected jump host’s lock applies in the form', async () => {
    const vault = new Vault({ cost: { N: 2 ** 10, r: 8, p: 1 } });
    await vault.create('pin', '123456');
    vault.close();
    saved({ ...BASTION, protected: true }, DB);
    const user = userEvent.setup();
    await renderApp('/connections/db');
    await user.type(await screen.findByLabelText('PIN'), '123456');
    await user.press(screen.getByRole('button', { name: 'Unlock' }));

    expect(
      await screen.findByText('Its jump host, Bastion, already asks for the app lock')
    ).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Require unlock' })).toBeChecked();
  });
});
