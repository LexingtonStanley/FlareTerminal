import { act, renderHook } from '@testing-library/react-native';
import * as ReactNative from 'react-native';

import { appTheme } from '@/constants/app-themes';
import { PreferencesProvider, usePreferences } from '@/features/settings/preferences-provider';
import { useTerminalTheme } from '@/features/settings/use-terminal-theme';
import { clearMemoryStorage, readJson, writeJson } from '@/test-utils/memory-storage';

import { useShape, useTheme } from './use-theme';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

const PREFERENCES = 'flare.preferences.v1';

function useEverything() {
  return {
    colors: useTheme(),
    terminal: useTerminalTheme(),
    shape: useShape(),
    preferences: usePreferences(),
  };
}

async function renderTheme() {
  const { result } = await renderHook(useEverything, { wrapper: PreferencesProvider });
  return result;
}

let system: 'light' | 'dark' = 'light';

beforeEach(() => {
  clearMemoryStorage();
  system = 'light';
  jest.spyOn(ReactNative, 'useColorScheme').mockImplementation(() => system);
});

afterEach(() => jest.restoreAllMocks());

describe('the app theme', () => {
  it('is Flare, following the phone, by default', async () => {
    system = 'dark';
    const result = await renderTheme();

    expect(result.current.colors).toBe(appTheme('flare', 'dark').colors);
    expect(result.current.terminal).toBe(appTheme('flare', 'dark').terminal);
  });

  it('carries over the terminal scheme chosen before themes', async () => {
    writeJson(PREFERENCES, { fontSize: 14, terminalScheme: 'catppuccin' });
    const result = await renderTheme();

    expect(result.current.preferences.appTheme).toBe('catppuccin');
    expect(result.current.colors).toBe(appTheme('catppuccin', 'light').colors);
  });

  it('falls back to Flare when the stored theme is unknown', async () => {
    writeJson(PREFERENCES, { fontSize: 14, appTheme: 'vaporwave' });

    expect((await renderTheme()).current.colors).toBe(appTheme('flare', 'light').colors);
  });

  it('sets the app, the terminal and the shape together, and remembers the choice', async () => {
    const result = await renderTheme();
    await act(() => result.current.preferences.setAppTheme('concrete'));

    expect(result.current.colors).toBe(appTheme('concrete', 'light').colors);
    expect(result.current.terminal).toBe(appTheme('concrete', 'light').terminal);
    expect(result.current.shape).toMatchObject({ radius: { large: 0 }, hairline: 2 });
    expect(readJson(PREFERENCES)).toMatchObject({ appTheme: 'concrete' });
  });

  it('uses a chosen appearance over the phone’s', async () => {
    const result = await renderTheme();
    await act(() => result.current.preferences.setAppearance('dark'));

    expect(result.current.colors).toBe(appTheme('flare', 'dark').colors);
    expect(readJson(PREFERENCES)).toMatchObject({ appearance: 'dark' });

    await act(() => result.current.preferences.setAppearance('system'));
    expect(result.current.colors).toBe(appTheme('flare', 'light').colors);
  });
});
