import { renderHook } from '@testing-library/react-native';

import { terminalTheme } from '@/constants/terminal-schemes';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { clearMemoryStorage, writeJson } from '@/test-utils/memory-storage';

import { PreferencesProvider } from './preferences-provider';
import { useTerminalTheme } from './use-terminal-theme';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: jest.fn() }));

const PREFERENCES = 'flare.preferences.v1';

async function renderTerminalTheme() {
  const { result } = await renderHook(() => useTerminalTheme(), { wrapper: PreferencesProvider });
  return result.current;
}

beforeEach(() => {
  clearMemoryStorage();
  jest.mocked(useColorScheme).mockReturnValue('light');
});

describe('useTerminalTheme', () => {
  it('is Flare by default', async () => {
    expect(await renderTerminalTheme()).toBe(terminalTheme('flare', 'light'));
  });

  it('gives the chosen scheme in the phone’s appearance', async () => {
    writeJson(PREFERENCES, { fontSize: 14, terminalScheme: 'catppuccin' });
    jest.mocked(useColorScheme).mockReturnValue('dark');

    expect(await renderTerminalTheme()).toBe(terminalTheme('catppuccin', 'dark'));
  });

  it('falls back to Flare when the stored scheme is unknown', async () => {
    writeJson(PREFERENCES, { fontSize: 14, terminalScheme: 'neon' });

    expect(await renderTerminalTheme()).toBe(terminalTheme('flare', 'light'));
  });
});
