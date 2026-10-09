import { createContext, use } from 'react';

import { DEFAULT_APP_THEME, type AppThemeId } from '@/constants/app-themes';

// Apart from the provider, so drawing in the theme doesn't load storage (SQLite on a device).

export const APPEARANCES = ['system', 'light', 'dark'] as const;

/** Light or dark mode: the phone's, or one chosen in Settings. */
export type Appearance = (typeof APPEARANCES)[number];

export type Preferences = {
  fontSize: number;
  /** The app's theme, which sets the terminal's colours too. */
  appTheme: AppThemeId;
  appearance: Appearance;
  /** The load, memory and disk strip above SSH sessions. */
  hostHealth: boolean;
};

export type PreferencesContextValue = Preferences & {
  setAppTheme(theme: AppThemeId): void;
  setAppearance(appearance: Appearance): void;
  setFontSize(size: number): void;
  setHostHealth(on: boolean): void;
};

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * The theme and appearance, or the defaults outside <PreferencesProvider> (the root error
 * screen draws before it), so anything can call useTheme().
 */
export function useAppearance(): Pick<Preferences, 'appTheme' | 'appearance'> {
  const value = use(PreferencesContext);
  return {
    appTheme: value?.appTheme ?? DEFAULT_APP_THEME,
    appearance: value?.appearance ?? 'system',
  };
}
