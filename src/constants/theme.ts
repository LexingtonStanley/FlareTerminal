/**
 * Flare's design tokens: colours for light and dark mode, type, spacing and radii.
 * docs/design.md explains the direction and when to use each token. Screens take colours
 * from useTheme(), never as literals.
 */

import '@/global.css';

import { Platform, type TextStyle } from 'react-native';

export const Colors = {
  light: {
    // Warm paper, white cards and ink text: daylight, not an inverted dark mode.
    text: '#1A1816',
    textSecondary: '#5F5952',
    background: '#F6F5F3',
    /** Cards, rows and fields. */
    backgroundElement: '#FFFFFF',
    /** Pressed rows, the selected tab, segmented-control tracks. */
    backgroundSelected: '#ECE9E4',
    /** Things that float: banners, popovers, the key bubble. */
    backgroundRaised: '#FFFFFF',
    border: '#E2DED8',
    // Ember: the one accent. Primary actions, focus, the live session, the cursor.
    primary: '#C2410C',
    onPrimary: '#FFFFFF',
    /** A quiet ember tint behind selected chips and armed modifiers. */
    primaryMuted: '#FCEDE3',
    success: '#17803F',
    warning: '#8F5B00',
    danger: '#C9262E',
    /** An agent asking for you: the flare going up. */
    attention: '#C2410C',
    shadow: '#2B2116',
    // The in-app keyboard: white character keys on a warm tray, darker function keys,
    // and an ember tint for a one-shot modifier (locked ones use primary).
    keyboard: '#E3DFD9',
    key: '#FFFFFF',
    keyFunction: '#D5D0C8',
    keyShadow: '#A39C92',
    keyArmed: '#FCEDE3',
  },
  dark: {
    // Deep ink with a cool cast, so the warm accent glows against it.
    text: '#ECEEF1',
    textSecondary: '#9199A5',
    background: '#0B0D10',
    backgroundElement: '#14171C',
    backgroundSelected: '#1E2229',
    backgroundRaised: '#22262D',
    border: '#252931',
    primary: '#FF8A3D',
    onPrimary: '#1B0E04',
    primaryMuted: '#2E1F15',
    success: '#3DD68C',
    warning: '#F2C14E',
    danger: '#FF6369',
    attention: '#FF8A3D',
    shadow: '#000000',
    keyboard: '#13151A',
    key: '#2C3038',
    keyFunction: '#1F2229',
    keyShadow: '#050608',
    keyArmed: '#3D2716',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export type Theme = { [Name in ThemeColor]: string };

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
 * Flare's own terminal colours, the default scheme. The background is the app's, so the
 * terminal is the screen rather than a box on it; the cursor is the ember accent. Every
 * foreground colour clears 4.5:1 on its background except the deliberately dim ones
 * (bright black, and the brights in light mode stay above 3:1).
 */
export const TerminalColors: Record<'light' | 'dark', TerminalTheme> = {
  light: {
    background: Colors.light.background,
    foreground: '#1F1D1A',
    cursor: '#D9480F',
    cursorAccent: Colors.light.background,
    selectionBackground: '#E8590C33',
    black: '#1F1D1A',
    red: '#C9262E',
    green: '#16794A',
    yellow: '#8F5B00',
    blue: '#1F5FCC',
    magenta: '#9C3FC4',
    cyan: '#0E7C86',
    white: '#6F6A63',
    brightBlack: '#7F7971',
    brightRed: '#D7373E',
    brightGreen: '#138A50',
    brightYellow: '#9A6A00',
    brightBlue: '#2F6FE0',
    brightMagenta: '#A64ACF',
    brightCyan: '#0B8793',
    brightWhite: '#8A847C',
  },
  dark: {
    background: Colors.dark.background,
    foreground: '#D9DDE3',
    cursor: Colors.dark.primary,
    cursorAccent: Colors.dark.background,
    selectionBackground: '#FF8A3D40',
    black: '#2A2F37',
    red: '#FF6369',
    green: '#3DD68C',
    yellow: '#F2C14E',
    blue: '#6AA8FF',
    magenta: '#C792EA',
    cyan: '#4FD1D9',
    white: '#C9CED6',
    brightBlack: '#727B88',
    brightRed: '#FF8A8F',
    brightGreen: '#6EE7A8',
    brightYellow: '#FFD978',
    brightBlue: '#93C0FF',
    brightMagenta: '#E0B0FF',
    brightCyan: '#7FE5EB',
    brightWhite: '#F3F5F8',
  },
};

/**
 * Geist and Geist Mono (SIL OFL 1.1, assets/fonts), loaded at startup by the root layout.
 * Each weight is its own family: Android and iOS only find a custom font's weights by
 * name, so styles pick a family with sans() or mono() and never set fontWeight.
 */
export const FontFiles = {
  'Geist-Regular': require('../../assets/fonts/Geist-Regular.ttf'),
  'Geist-Medium': require('../../assets/fonts/Geist-Medium.ttf'),
  'Geist-SemiBold': require('../../assets/fonts/Geist-SemiBold.ttf'),
  'Geist-Bold': require('../../assets/fonts/Geist-Bold.ttf'),
  'GeistMono-Regular': require('../../assets/fonts/GeistMono-Regular.ttf'),
  'GeistMono-Medium': require('../../assets/fonts/GeistMono-Medium.ttf'),
  'GeistMono-SemiBold': require('../../assets/fonts/GeistMono-SemiBold.ttf'),
} as const;

type FontFamily = keyof typeof FontFiles;

const SANS = {
  400: 'Geist-Regular',
  500: 'Geist-Medium',
  600: 'Geist-SemiBold',
  700: 'Geist-Bold',
} as const satisfies Record<number, FontFamily>;

const MONO = {
  400: 'GeistMono-Regular',
  500: 'GeistMono-Medium',
  600: 'GeistMono-SemiBold',
} as const satisfies Record<number, FontFamily>;

// On the web a stack keeps text readable if a font file fails to load.
const family = (name: FontFamily, fallback: string) =>
  Platform.OS === 'web' ? `${name}, ${fallback}` : name;

/** The UI typeface at a weight. */
export function sans(weight: keyof typeof SANS = 400): Pick<TextStyle, 'fontFamily'> {
  return { fontFamily: family(SANS[weight], 'var(--font-display)') };
}

/** Monospace, for what is typed or read by a computer: hosts, commands, keys. */
export function mono(weight: keyof typeof MONO = 400): Pick<TextStyle, 'fontFamily'> {
  return { fontFamily: family(MONO[weight], 'var(--font-mono)') };
}

export const Fonts = {
  sans: sans(400).fontFamily!,
  mono: mono(400).fontFamily!,
  serif: Platform.select({ ios: 'ui-serif', web: 'var(--font-serif)', default: 'serif' }),
  rounded: Platform.select({ ios: 'ui-rounded', web: 'var(--font-rounded)', default: 'normal' }),
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Corner radii: keys and chips are small, rows and fields medium, cards large. */
export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
  pill: 999,
} as const;

export const MaxContentWidth = 800;
