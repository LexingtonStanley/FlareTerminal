import { use, useEffect, useState, type PropsWithChildren } from 'react';
import { Appearance as SystemAppearance } from 'react-native';

import { DEFAULT_APP_THEME, isAppThemeId } from '@/constants/app-themes';
import { readJson, writeJson } from '@/lib/storage';

import {
  APPEARANCES,
  PreferencesContext,
  type Appearance,
  type Preferences,
  type PreferencesContextValue,
} from './preferences-context';

export type { Appearance, Preferences } from './preferences-context';

const STORAGE_KEY = 'flare.preferences.v1';

export const FONT_SIZE = { min: 10, max: 24, default: 14 } as const;

function clampFontSize(size: number) {
  return Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(size)));
}

function isAppearance(value: unknown): value is Appearance {
  return APPEARANCES.includes(value as Appearance);
}

/** What's stored, including the terminal scheme that a theme replaced (its ids carried over). */
type Stored = Partial<Preferences> & { terminalScheme?: unknown };

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    const stored = readJson<Stored>(STORAGE_KEY);
    const fontSize = stored?.fontSize;
    const theme = stored?.appTheme ?? stored?.terminalScheme;
    return {
      appTheme: isAppThemeId(theme) ? theme : DEFAULT_APP_THEME,
      appearance: isAppearance(stored?.appearance) ? stored.appearance : 'system',
      fontSize: typeof fontSize === 'number' ? clampFontSize(fontSize) : FONT_SIZE.default,
      hostHealth: stored?.hostHealth !== false,
    };
  });

  // The phone's own UI (the status bar, alerts, its keyboard) follows a chosen appearance too.
  useEffect(() => {
    SystemAppearance.setColorScheme?.(
      preferences.appearance === 'system' ? 'unspecified' : preferences.appearance
    );
  }, [preferences.appearance]);

  function update(changes: Partial<Preferences>) {
    const next = { ...preferences, ...changes };
    writeJson(STORAGE_KEY, next);
    setPreferences(next);
  }

  const value: PreferencesContextValue = {
    ...preferences,
    setAppTheme: (appTheme) => update({ appTheme }),
    setAppearance: (appearance) => update({ appearance }),
    setFontSize: (size) => update({ fontSize: clampFontSize(size) }),
    setHostHealth: (hostHealth) => update({ hostHealth }),
  };

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): PreferencesContextValue {
  const value = use(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return value;
}
