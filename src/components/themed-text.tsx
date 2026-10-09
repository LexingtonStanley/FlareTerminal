import { StyleSheet, Text, type TextProps } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  /**
   * - title, subtitle: screen headings. headline: a card or row title.
   * - default, small: body text. smallBold: emphasis at body size.
   * - overline: a section's heading. eyebrow: a field's label.
   * - caption: fine print, counts, timestamps.
   * - code: monospace, for hosts, commands, keys and fingerprints.
   * - link, linkPrimary: inline links.
   */
  type?:
    | 'default'
    | 'title'
    | 'subtitle'
    | 'headline'
    | 'small'
    | 'smallBold'
    | 'overline'
    | 'eyebrow'
    | 'caption'
    | 'link'
    | 'linkPrimary'
    | 'code';
  /** A theme colour; primary means the accent as text (primaryText). */
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const { displayTracking } = useShape();
  const { sans, mono, display, label } = useType();
  const named = themeColor ?? (type === 'linkPrimary' ? 'primary' : 'text');
  const color = theme[named === 'primary' ? 'primaryText' : named];

  // Sizes are fixed; the theme sets the faces, and the case, tracking and glow of headings.
  const face = {
    title: { ...display, letterSpacing: displayTracking - 0.3 },
    subtitle: { ...display, letterSpacing: displayTracking },
    headline: sans(600),
    default: sans(400),
    small: sans(400),
    smallBold: sans(600),
    overline: label,
    eyebrow: sans(500),
    caption: sans(500),
    link: sans(500),
    linkPrimary: sans(500),
    code: mono(400),
  }[type];

  return <Text style={[{ color }, styles[type], face, style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 34, lineHeight: 40 },
  subtitle: { fontSize: 26, lineHeight: 32 },
  headline: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  default: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 20 },
  smallBold: { fontSize: 14, lineHeight: 20 },
  overline: { fontSize: 12, lineHeight: 16 },
  eyebrow: { fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  caption: { fontSize: 12, lineHeight: 16 },
  link: { fontSize: 14, lineHeight: 20 },
  linkPrimary: { fontSize: 15, lineHeight: 22 },
  code: { fontSize: 13, lineHeight: 19 },
});
