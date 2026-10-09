import type { TerminalTheme } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-theme';

/** The terminal's colours: the chosen theme's, in the current mode. */
export function useTerminalTheme(): TerminalTheme {
  return useAppTheme().terminal;
}
