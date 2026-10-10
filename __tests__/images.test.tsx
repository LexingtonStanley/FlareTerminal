import { act, fireEvent, userEvent } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { screen } from 'expo-router/testing-library';

import type { Connection } from '@/features/connections/connections';
import { transports, type FakeCommand } from '@/test-utils/fake-transport';
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
jest.mock('expo-clipboard', () => ({
  ...jest.requireActual('expo-clipboard'),
  getImageAsync: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  ...jest.requireActual('expo-image-picker'),
  launchImageLibraryAsync: jest.fn(),
}));

const DEVBOX: Connection = {
  id: 'devbox',
  kind: 'ssh',
  name: 'Devbox',
  host: 'devbox',
  port: 22,
  username: 'ada',
};

// A PNG's signature and one more byte: enough for Flare to know it.
const PNG = 'iVBORw0KGgoA';
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const SAVED = '/home/ada/.flare/uploads/flare-20261010-142301-3fa9.png';

const getImage = jest.mocked(Clipboard.getImageAsync);
const library = jest.mocked(ImagePicker.launchImageLibraryAsync);

beforeEach(() => {
  clearMemoryStorage();
  transports.splice(0);
  library.mockReset();
  getImage
    .mockReset()
    .mockResolvedValue({ data: `data:image/png;base64,${PNG}`, size: { width: 1, height: 1 } });
});

/** Opens a connection and writes with the phone's keyboard. */
async function write(connection: Connection = DEVBOX) {
  writeJson('flare.connections.v1', [connection]);
  await renderApp('/');
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: `Open ${connection.name}` }));
  const transport = transports[0];
  await act(() => transport.status({ state: 'connected' }));
  await fireEvent(screen.getByRole('button', { name: 'Hide keyboard' }), 'accessibilityAction', {
    nativeEvent: { actionName: 'up' },
  });
  return { user, transport, field: await screen.findByLabelText('Command') };
}

const button = (name: string) => screen.getByRole('button', { name });

/** The uploads the app started (the health strip runs its own command beside them). */
const uploads = (transport: (typeof transports)[number]) =>
  transport.commands.filter(({ command }) => command.startsWith('sh -c'));

/** The host's side of the upload: what it printed, then the command ends. */
async function answer(command: FakeCommand, output: string) {
  await act(() => {
    command.events.onData(new TextEncoder().encode(output));
    command.events.onClose();
  });
}

describe('sending an image', () => {
  it('pastes a screenshot to the host and writes its path into the prompt', async () => {
    const { user, transport, field } = await write();
    await user.type(field, 'Why is this red?');

    await user.press(button('Attach an image'));
    await user.press(button('Paste an image'));

    const [command] = uploads(transport);
    expect(command.command).toMatch(/^sh -c '.*head -c 9 > flare-\d{8}-\d{6}-[0-9a-f]{4}\.png /);
    expect(command.sentBytes).toEqual([new Uint8Array(PNG_BYTES)]);
    expect(screen.getByText('Sending the image…')).toBeOnTheScreen();

    await answer(command, `saved:${SAVED}\n`);

    expect(field).toHaveDisplayValue(`Why is this red? ${SAVED} `);
    expect(command.closed).toBe(true);
    expect(screen.queryByText('Sending the image…')).not.toBeOnTheScreen();
    // Nothing reached the agent: the person sends when they're ready.
    expect(transport.written).toEqual([]);
  });

  it('keeps what the person writes while it’s on its way', async () => {
    const { user, transport, field } = await write();

    await user.press(button('Attach an image'));
    await user.press(button('Paste an image'));
    await user.type(field, 'Look at');
    await answer(uploads(transport)[0], `saved:${SAVED}\n`);

    expect(field).toHaveDisplayValue(`Look at ${SAVED} `);
  });

  it('sends a photo chosen from the library', async () => {
    const { user, transport, field } = await write();
    library.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', width: 4, height: 3, base64: '/9j/4AAQ' }],
    });

    await user.press(button('Attach an image'));
    await user.press(button('Choose a photo'));
    const [command] = uploads(transport);
    expect(command.command).toMatch(/\.jpg && echo/);
    await answer(command, `saved:/home/ada/.flare/uploads/photo.jpg\n`);

    expect(field).toHaveDisplayValue('/home/ada/.flare/uploads/photo.jpg ');
  });

  it('sends nothing when the person backs out of the picker', async () => {
    const { user, transport } = await write();
    library.mockResolvedValue({ canceled: true, assets: null });

    await user.press(button('Attach an image'));
    await user.press(button('Choose a photo'));

    expect(uploads(transport)).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Choose a photo' })).not.toBeOnTheScreen();
  });

  it('says why the host didn’t save it', async () => {
    const { user, transport, field } = await write();

    await user.press(button('Attach an image'));
    await user.press(button('Paste an image'));
    await answer(uploads(transport)[0], 'mkdir: cannot create directory: No space left\n');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t send the image. The host said: mkdir: cannot create directory: No space left'
    );
    expect(field).toHaveDisplayValue('');
    await user.press(button('Dismiss'));
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('says when the clipboard has no image', async () => {
    const { user, transport } = await write();
    getImage.mockResolvedValue(null);

    await user.press(button('Attach an image'));
    await user.press(button('Paste an image'));

    expect(screen.getByRole('alert')).toHaveTextContent('There’s no image on the clipboard', {
      exact: true,
    });
    expect(uploads(transport)).toEqual([]);
  });

  it('stops sending when cancelled', async () => {
    const { user, transport, field } = await write();

    await user.press(button('Attach an image'));
    await user.press(button('Paste an image'));
    await user.press(button('Stop sending'));

    expect(uploads(transport)[0].closed).toBe(true);
    expect(screen.queryByText('Sending the image…')).not.toBeOnTheScreen();
    expect(field).toHaveDisplayValue('');
  });

  it('closes the menu with the image button or Close', async () => {
    const { user } = await write();
    const menu = () => screen.queryByRole('button', { name: 'Paste an image' });

    await user.press(button('Attach an image'));
    expect(menu()).toBeOnTheScreen();
    await user.press(button('Attach an image'));
    expect(menu()).not.toBeOnTheScreen();
    await user.press(button('Attach an image'));
    await user.press(button('Close'));
    expect(menu()).not.toBeOnTheScreen();
  });

  it('isn’t offered while the host asks for a password', async () => {
    const { transport } = await write();

    await act(() => transport.inputMode('secret'));

    expect(screen.queryByRole('button', { name: 'Attach an image' })).not.toBeOnTheScreen();
  });

  it('isn’t offered over ttyd, which can’t run a command beside the terminal', async () => {
    await write({ id: 'web', kind: 'ttyd', name: 'Web box', url: 'web:7681', username: '' });

    expect(screen.queryByRole('button', { name: 'Attach an image' })).not.toBeOnTheScreen();
  });
});
