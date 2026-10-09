import { createContext, use, useState, type PropsWithChildren } from 'react';

import {
  DEFAULT_TERMINAL_SCHEME,
  isTerminalSchemeId,
  type TerminalSchemeId,
} from '@/constants/terminal-schemes';
import { readJson, writeJson } from '@/lib/storage';

const STORAGE_KEY = 'flare.preferences.v1';

export const FONT_SIZE = { min: 10, max: 24, default: 14 } as const;

/** Which keyboard the terminal uses: the phone's (with the key bar) or the in-app one. */
export type KeyboardChoice = 'system' | 'coding';

export type Preferences = {
  fontSize: number;
  keyboard: KeyboardChoice;
  /** The terminal's colour scheme; its light or dark variant follows the phone. */
  terminalScheme: TerminalSchemeId;
};

type PreferencesContextValue = Preferences & {
  setTerminalScheme(scheme: TerminalSchemeId): void;
  setFontSize(size: number): void;
  setKeyboard(keyboard: KeyboardChoice): void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function clampFontSize(size: number) {
  return Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(size)));
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    const stored = readJson<Partial<Preferences>>(STORAGE_KEY);
    const fontSize = stored?.fontSize;
    const terminalScheme = stored?.terminalScheme;
    return {
      terminalScheme: isTerminalSchemeId(terminalScheme) ? terminalScheme : DEFAULT_TERMINAL_SCHEME,
      fontSize: typeof fontSize === 'number' ? clampFontSize(fontSize) : FONT_SIZE.default,
      keyboard: stored?.keyboard === 'coding' ? 'coding' : 'system',
    };
  });

  function update(changes: Partial<Preferences>) {
    const next = { ...preferences, ...changes };
    writeJson(STORAGE_KEY, next);
    setPreferences(next);
  }

  const value: PreferencesContextValue = {
    ...preferences,
    setTerminalScheme: (terminalScheme) => update({ terminalScheme }),
    setFontSize: (size) => update({ fontSize: clampFontSize(size) }),
    setKeyboard: (keyboard) => update({ keyboard }),
  };

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): PreferencesContextValue {
  const value = use(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return value;
}
