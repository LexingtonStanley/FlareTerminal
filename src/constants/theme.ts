/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: '#208AEF',
    onPrimary: '#FFFFFF',
    danger: '#D93025',
    success: '#1A7F37',
    border: '#D9D9DE',
    // The in-app keyboard: character keys on a tray, darker function keys, and a tint
    // for a one-shot modifier (locked ones use primary).
    keyboard: '#D3D6DC',
    key: '#FFFFFF',
    keyFunction: '#AFB4BE',
    keyShadow: '#898C93',
    keyArmed: '#CFE5FC',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    primary: '#4AA3F5',
    onPrimary: '#FFFFFF',
    danger: '#FF6B6B',
    success: '#3FB950',
    border: '#3A3B40',
    keyboard: '#151618',
    key: '#46484E',
    keyFunction: '#2A2C30',
    keyShadow: '#000000',
    keyArmed: '#173A60',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * xterm.js themes (the 16 ANSI colors follow VS Code's integrated terminal). Background and
 * foreground match the app so the terminal blends into the screen in both modes.
 */
export const TerminalColors = {
  light: {
    background: Colors.light.background,
    foreground: '#1F2328',
    cursor: Colors.light.primary,
    cursorAccent: Colors.light.background,
    selectionBackground: '#208AEF40',
    black: '#000000',
    red: '#CD3131',
    green: '#107C10',
    yellow: '#949800',
    blue: '#0451A5',
    magenta: '#BC05BC',
    cyan: '#0598BC',
    white: '#555555',
    brightBlack: '#666666',
    brightRed: '#CD3131',
    brightGreen: '#14CE14',
    brightYellow: '#B5BA00',
    brightBlue: '#0451A5',
    brightMagenta: '#BC05BC',
    brightCyan: '#0598BC',
    brightWhite: '#A5A5A5',
  },
  dark: {
    background: Colors.dark.background,
    foreground: '#E5E5E5',
    cursor: Colors.dark.primary,
    cursorAccent: Colors.dark.background,
    selectionBackground: '#4AA3F555',
    black: '#000000',
    red: '#CD3131',
    green: '#0DBC79',
    yellow: '#E5E510',
    blue: '#2472C8',
    magenta: '#BC3FBC',
    cyan: '#11A8CD',
    white: '#E5E5E5',
    brightBlack: '#666666',
    brightRed: '#F14C4C',
    brightGreen: '#23D18B',
    brightYellow: '#F5F543',
    brightBlue: '#3B8EEA',
    brightMagenta: '#D670D6',
    brightCyan: '#29B8DB',
    brightWhite: '#E5E5E5',
  },
} as const;

export type TerminalTheme = (typeof TerminalColors)['light' | 'dark'];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

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
