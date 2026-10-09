import { userEvent } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import { clearMemoryStorage, readJson } from '@/test-utils/memory-storage';
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

beforeEach(() => clearMemoryStorage());

describe('terminal colours', () => {
  it('starts with Flare, then remembers the scheme chosen in Settings', async () => {
    const user = userEvent.setup();
    await renderApp('/settings');

    expect(await screen.findByRole('radio', { name: 'Flare' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Gruvbox' }));

    expect(screen.getByRole('radio', { name: 'Gruvbox' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Flare' })).not.toBeChecked();
    expect(readJson('flare.preferences.v1')).toMatchObject({ terminalScheme: 'gruvbox' });
  });
});
