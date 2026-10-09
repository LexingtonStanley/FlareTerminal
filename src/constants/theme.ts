/**
 * Flare's design tokens: type, spacing and, through app-themes.ts, colours and shape for every
 * theme in light and dark mode. docs/design.md explains the direction and when to use each
 * token. Screens take them from useTheme(), useShape() and useType(), never as literals.
 */

import '@/global.css';

import { Platform, type TextStyle } from 'react-native';

import { appTheme, type AppColors } from './app-themes';

/** Flare's colours, the default theme's. Screens use useTheme(), which follows the chosen theme. */
export const Colors = {
  light: appTheme('flare', 'light').colors,
  dark: appTheme('flare', 'dark').colors,
};

export type ThemeColor = keyof AppColors;

export type Theme = AppColors;

/** The colours xterm.js draws with: the screen, the cursor, selection and the 16 ANSI colours. */
export type TerminalTheme = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

/**
 * Geist, Geist Mono, Chakra Petch, Tilt Neon and IBM Plex Mono (SIL OFL 1.1, assets/fonts),
 * loaded at startup by the root layout. Each weight is its own family: Android and iOS only
 * find a custom font's weights by name, so styles pick a family through useType() and never
 * set fontWeight.
 */
export const FontFiles = {
  'Geist-Regular': require('../../assets/fonts/Geist-Regular.ttf'),
  'Geist-Medium': require('../../assets/fonts/Geist-Medium.ttf'),
  'Geist-SemiBold': require('../../assets/fonts/Geist-SemiBold.ttf'),
  'Geist-Bold': require('../../assets/fonts/Geist-Bold.ttf'),
  'GeistMono-Regular': require('../../assets/fonts/GeistMono-Regular.ttf'),
  'GeistMono-Medium': require('../../assets/fonts/GeistMono-Medium.ttf'),
  'GeistMono-SemiBold': require('../../assets/fonts/GeistMono-SemiBold.ttf'),
  'ChakraPetch-Medium': require('../../assets/fonts/ChakraPetch-Medium.ttf'),
  'ChakraPetch-SemiBold': require('../../assets/fonts/ChakraPetch-SemiBold.ttf'),
  'ChakraPetch-Bold': require('../../assets/fonts/ChakraPetch-Bold.ttf'),
  'TiltNeon-Regular': require('../../assets/fonts/TiltNeon-Regular.ttf'),
  'IBMPlexMono-Regular': require('../../assets/fonts/IBMPlexMono-Regular.ttf'),
  'IBMPlexMono-Medium': require('../../assets/fonts/IBMPlexMono-Medium.ttf'),
  'IBMPlexMono-SemiBold': require('../../assets/fonts/IBMPlexMono-SemiBold.ttf'),
  'IBMPlexMono-Bold': require('../../assets/fonts/IBMPlexMono-Bold.ttf'),
} as const;

type FontFamily = keyof typeof FontFiles;

export type FontWeight = 400 | 500 | 600 | 700;

/** A typeface's families by weight. A theme picks faces for its type roles. */
export const FontRoles = {
  geist: { 400: 'Geist-Regular', 500: 'Geist-Medium', 600: 'Geist-SemiBold', 700: 'Geist-Bold' },
  geistMono: { 400: 'GeistMono-Regular', 500: 'GeistMono-Medium', 600: 'GeistMono-SemiBold' },
  chakraPetch: { 500: 'ChakraPetch-Medium', 600: 'ChakraPetch-SemiBold', 700: 'ChakraPetch-Bold' },
  tiltNeon: { 400: 'TiltNeon-Regular' },
  plexMono: {
    400: 'IBMPlexMono-Regular',
    500: 'IBMPlexMono-Medium',
    600: 'IBMPlexMono-SemiBold',
    700: 'IBMPlexMono-Bold',
  },
} as const satisfies Record<string, Partial<Record<FontWeight, FontFamily>>>;

export type FontFace = keyof typeof FontRoles;

const MONOSPACED: readonly FontFace[] = ['geistMono', 'plexMono'];

/** A face at a weight, or at the nearest weight it has (Tilt Neon has only one). */
export function fontFamily(face: FontFace, weight: FontWeight): string {
  const weights: Partial<Record<FontWeight, FontFamily>> = FontRoles[face];
  const nearest = (Object.keys(weights).map(Number) as FontWeight[]).reduce((best, candidate) =>
    Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best
  );
  const name = weights[weight] ?? weights[nearest]!;
  // On the web a stack keeps text readable if a font file fails to load.
  if (Platform.OS !== 'web') return name;
  return `${name}, ${MONOSPACED.includes(face) ? 'var(--font-mono)' : 'var(--font-display)'}`;
}

/** A face at a weight, as a style. */
export function font(face: FontFace, weight: FontWeight = 400): Pick<TextStyle, 'fontFamily'> {
  return { fontFamily: fontFamily(face, weight) };
}

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;
