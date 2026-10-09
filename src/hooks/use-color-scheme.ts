import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useAppearance } from '@/features/settings/preferences-context';

/** Light or dark: the appearance chosen in Settings, or the phone's. */
export function useColorScheme(): 'light' | 'dark' {
  const { appearance } = useAppearance();
  const system = useSystemColorScheme();
  if (appearance !== 'system') return appearance;
  return system === 'dark' ? 'dark' : 'light';
}
