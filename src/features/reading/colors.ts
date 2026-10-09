import type { TextStyle } from 'react-native';

import type { TerminalTheme } from '@/constants/theme';
import type { Type } from '@/hooks/use-theme';

import type { Color, Span } from './history';

const ANSI: (keyof TerminalTheme)[] = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

const hex = (...values: number[]) =>
  `#${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`;

/**
 * The 256 colours a program can name: the theme's 16, then xterm's 6×6×6 cube and its 24
 * greys, as the terminal draws them.
 */
export function palette(theme: TerminalTheme): string[] {
  const colors = ANSI.map((name) => theme[name]);
  for (let i = 0; i < 216; i++) {
    colors.push(
      hex(CUBE_LEVELS[Math.floor(i / 36)], CUBE_LEVELS[Math.floor(i / 6) % 6], CUBE_LEVELS[i % 6])
    );
  }
  for (let i = 0; i < 24; i++) colors.push(hex(8 + i * 10, 8 + i * 10, 8 + i * 10));
  return colors;
}

const resolve = (color: Color | undefined, colors: string[]) =>
  typeof color === 'number' ? colors[color] : color;

/** WCAG relative luminance of a `#rrggbb` colour; null for anything else. */
function luminance(color: string): number | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color);
  if (!match) return null;
  const [r, g, b] = match.slice(1).map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  if (x === null || y === null) return 21;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Text in the default colour on a background a program chose: that colour, unless the other
 * end of the theme reads better on it. Claude Code shades its prompts with a dark grey that
 * the light themes' dark text disappears into.
 */
function readableOn(background: string, theme: TerminalTheme): string {
  return contrast(theme.foreground, background) >= contrast(theme.background, background)
    ? theme.foreground
    : theme.background;
}

/** Faint text: the colour at 60%, when it is a `#rrggbb` one. */
const faint = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? `${color}99` : color);

/**
 * How a span looks in reading mode: its colours (swapped when inverse), faint, bold, italic,
 * underlined or struck through. Nothing for plain text, which takes the block's style.
 */
export function spanStyle(
  span: Span,
  colors: string[],
  theme: TerminalTheme,
  mono: Type['mono']
): TextStyle | undefined {
  let color = resolve(span.fg, colors);
  let backgroundColor = resolve(span.bg, colors);
  if (span.inverse) {
    [color, backgroundColor] = [backgroundColor ?? theme.background, color ?? theme.foreground];
  }
  if (backgroundColor && !color) color = readableOn(backgroundColor, theme);
  if (span.dim) color = faint(color ?? theme.foreground);
  const lines = [span.underline && 'underline', span.strike && 'line-through'].filter(Boolean);
  const style: TextStyle = {
    ...(color ? { color } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(span.bold ? mono(600) : {}),
    ...(span.italic ? { fontStyle: 'italic' } : {}),
    ...(lines.length
      ? { textDecorationLine: lines.join(' ') as TextStyle['textDecorationLine'] }
      : {}),
  };
  return Object.keys(style).length ? style : undefined;
}
