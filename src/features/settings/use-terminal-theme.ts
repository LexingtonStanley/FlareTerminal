import { terminalTheme } from '@/constants/terminal-schemes';
import type { TerminalTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { usePreferences } from './preferences-provider';

/** The terminal's colours: the chosen scheme, in the variant for the phone's appearance. */
export function useTerminalTheme(): TerminalTheme {
  const { terminalScheme } = usePreferences();
  return terminalTheme(terminalScheme, useColorScheme() === 'dark' ? 'dark' : 'light');
}
