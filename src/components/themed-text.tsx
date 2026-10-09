import { StyleSheet, Text, type TextProps } from 'react-native';

import { mono, sans, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = themeColor ?? (type === 'linkPrimary' ? 'primary' : 'text');

  return <Text style={[{ color: theme[color] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: { ...sans(600), fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  subtitle: { ...sans(600), fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  headline: { ...sans(600), fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  default: { ...sans(400), fontSize: 16, lineHeight: 24 },
  small: { ...sans(400), fontSize: 14, lineHeight: 20 },
  smallBold: { ...sans(600), fontSize: 14, lineHeight: 20 },
  overline: {
    ...sans(600),
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  eyebrow: { ...sans(500), fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  caption: { ...sans(500), fontSize: 12, lineHeight: 16 },
  link: { ...sans(500), fontSize: 14, lineHeight: 20 },
  linkPrimary: { ...sans(500), fontSize: 15, lineHeight: 22 },
  code: { ...mono(400), fontSize: 13, lineHeight: 19 },
});
