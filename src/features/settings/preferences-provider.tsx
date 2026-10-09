import { createContext, use, useState, type PropsWithChildren } from 'react';

import { readJson, writeJson } from '@/lib/storage';

const STORAGE_KEY = 'flare.preferences.v1';

export const FONT_SIZE = { min: 10, max: 24, default: 14 } as const;

export type Preferences = { fontSize: number };

type PreferencesContextValue = Preferences & {
  setFontSize(size: number): void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function clampFontSize(size: number) {
  return Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(size)));
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    const stored = readJson<Partial<Preferences>>(STORAGE_KEY);
    const fontSize = stored?.fontSize;
    return {
      fontSize: typeof fontSize === 'number' ? clampFontSize(fontSize) : FONT_SIZE.default,
    };
  });

  function update(changes: Partial<Preferences>) {
    const next = { ...preferences, ...changes };
    writeJson(STORAGE_KEY, next);
    setPreferences(next);
  }

  const value: PreferencesContextValue = {
    ...preferences,
    setFontSize: (size) => update({ fontSize: clampFontSize(size) }),
  };

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): PreferencesContextValue {
  const value = use(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return value;
}
