import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The app's icons: SF Symbols on iOS, Material Symbols on Android and the web. One name
 * here per meaning, so a symbol means the same thing on every screen.
 */
const ICONS = {
  add: { ios: 'plus', android: 'add', web: 'add' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  run: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  bell: { ios: 'bell.fill', android: 'notifications_active', web: 'notifications_active' },
  key: { ios: 'key.fill', android: 'key', web: 'key' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  warning: {
    ios: 'exclamationmark.triangle.fill',
    android: 'warning',
    web: 'warning',
  },
  error: { ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  terminal: { ios: 'terminal.fill', android: 'terminal', web: 'terminal' },
  server: { ios: 'server.rack', android: 'dns', web: 'dns' },
  network: { ios: 'network', android: 'language', web: 'language' },
  settings: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  copy: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  reconnect: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  keyboard: { ios: 'keyboard', android: 'keyboard', web: 'keyboard' },
  send: { ios: 'return', android: 'keyboard_return', web: 'keyboard_return' },
  lock: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  biometrics: { ios: 'faceid', android: 'fingerprint', web: 'fingerprint' },
  folder: { ios: 'folder.fill', android: 'folder', web: 'folder' },
  inbox: { ios: 'tray.fill', android: 'inbox', web: 'inbox' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  paste: { ios: 'doc.on.clipboard', android: 'content_paste', web: 'content_paste' },
  preview: { ios: 'safari', android: 'preview', web: 'preview' },
  back: { ios: 'chevron.backward', android: 'arrow_back', web: 'arrow_back' },
  forward: { ios: 'chevron.forward', android: 'arrow_forward', web: 'arrow_forward' },
  external: { ios: 'arrow.up.forward.square', android: 'open_in_new', web: 'open_in_new' },
} satisfies Record<string, SymbolViewProps['name']>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  /** A theme colour; defaults to secondary text. */
  color?: ThemeColor;
  weight?: SymbolViewProps['weight'];
  style?: StyleProp<ViewStyle>;
};

/** A decorative icon: hidden from screen readers, so its button or row names it. */
export function Icon({ name, size = 20, color = 'textSecondary', weight, style }: IconProps) {
  const theme = useTheme();

  return (
    <View aria-hidden style={[{ width: size, height: size }, style]} pointerEvents="none">
      <SymbolView name={ICONS[name]} size={size} tintColor={theme[color]} weight={weight} />
    </View>
  );
}
