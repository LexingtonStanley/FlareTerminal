import { TerminalColors, type TerminalTheme } from './theme';

/**
 * Terminal colour schemes for Settings. Each has a light and a dark variant; the phone's
 * appearance picks one, so a scheme follows light and dark mode like the rest of the app.
 * Flare's own scheme is the default and matches the app. The others are well-known
 * palettes, all under permissive licences (credited in README.md):
 *
 * - Tokyo Night: folke/tokyonight.nvim's terminal extras, Night and Day (Apache-2.0)
 * - Catppuccin: catppuccin/kitty, Mocha and Latte (MIT)
 * - Solarized: Ethan Schoonover's palette (MIT), with bright black lifted to base01 so
 *   dim text stays visible on the dark background
 * - Gruvbox: morhetz/gruvbox (MIT/X11), medium contrast
 */

export const TERMINAL_SCHEME_IDS = [
  'flare',
  'tokyo-night',
  'catppuccin',
  'solarized',
  'gruvbox',
] as const;

export type TerminalSchemeId = (typeof TERMINAL_SCHEME_IDS)[number];

export type TerminalScheme = {
  id: TerminalSchemeId;
  name: string;
  light: TerminalTheme;
  dark: TerminalTheme;
};

export const DEFAULT_TERMINAL_SCHEME: TerminalSchemeId = 'flare';

/** The 16 ANSI colours in their numbered order (0–15). */
const ANSI_NAMES = [
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
] as const;

type AnsiName = (typeof ANSI_NAMES)[number];

/** Builds a theme from the screen colours and color0–color15, as in a kitty or Xresources file. */
function theme(
  screen: { background: string; foreground: string; cursor: string; selection: string },
  colors: readonly string[]
): TerminalTheme {
  const ansi = Object.fromEntries(ANSI_NAMES.map((name, index) => [name, colors[index]]));
  return {
    background: screen.background,
    foreground: screen.foreground,
    cursor: screen.cursor,
    cursorAccent: screen.background,
    selectionBackground: screen.selection,
    ...(ansi as Record<AnsiName, string>),
  };
}

const SOLARIZED = {
  base03: '#002b36',
  base02: '#073642',
  base01: '#586e75',
  base00: '#657b83',
  base0: '#839496',
  base1: '#93a1a1',
  base2: '#eee8d5',
  base3: '#fdf6e3',
  yellow: '#b58900',
  orange: '#cb4b16',
  red: '#dc322f',
  magenta: '#d33682',
  violet: '#6c71c4',
  blue: '#268bd2',
  cyan: '#2aa198',
  green: '#859900',
};

function solarized(mode: 'light' | 'dark') {
  const s = SOLARIZED;
  const dark = mode === 'dark';
  return theme(
    {
      background: dark ? s.base03 : s.base3,
      foreground: dark ? s.base0 : s.base00,
      cursor: dark ? s.base1 : s.base01,
      selection: dark ? '#93a1a133' : '#586e7526',
    },
    [
      s.base02,
      s.red,
      s.green,
      s.yellow,
      s.blue,
      s.magenta,
      s.cyan,
      s.base2,
      dark ? s.base01 : s.base03,
      s.orange,
      s.base01,
      s.base00,
      s.base0,
      s.violet,
      s.base1,
      s.base3,
    ]
  );
}

export const TERMINAL_SCHEMES: readonly TerminalScheme[] = [
  { id: 'flare', name: 'Flare', light: TerminalColors.light, dark: TerminalColors.dark },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    dark: theme(
      { background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selection: '#283457' },
      [
        '#15161e',
        '#f7768e',
        '#9ece6a',
        '#e0af68',
        '#7aa2f7',
        '#bb9af7',
        '#7dcfff',
        '#a9b1d6',
        '#414868',
        '#ff899d',
        '#9fe044',
        '#faba4a',
        '#8db0ff',
        '#c7a9ff',
        '#a4daff',
        '#c0caf5',
      ]
    ),
    light: theme(
      { background: '#e1e2e7', foreground: '#3760bf', cursor: '#3760bf', selection: '#b7c1e3' },
      [
        '#b4b5b9',
        '#f52a65',
        '#587539',
        '#8c6c3e',
        '#2e7de9',
        '#9854f1',
        '#007197',
        '#6172b0',
        '#a1a6c5',
        '#ff4774',
        '#5c8524',
        '#a27629',
        '#358aff',
        '#a463ff',
        '#007ea8',
        '#3760bf',
      ]
    ),
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    dark: theme(
      { background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selection: '#585b7099' },
      [
        '#45475a',
        '#f38ba8',
        '#a6e3a1',
        '#f9e2af',
        '#89b4fa',
        '#f5c2e7',
        '#94e2d5',
        '#bac2de',
        '#585b70',
        '#f38ba8',
        '#a6e3a1',
        '#f9e2af',
        '#89b4fa',
        '#f5c2e7',
        '#94e2d5',
        '#a6adc8',
      ]
    ),
    light: theme(
      { background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', selection: '#acb0be99' },
      [
        '#5c5f77',
        '#d20f39',
        '#40a02b',
        '#df8e1d',
        '#1e66f5',
        '#ea76cb',
        '#179299',
        '#acb0be',
        '#6c6f85',
        '#d20f39',
        '#40a02b',
        '#df8e1d',
        '#1e66f5',
        '#ea76cb',
        '#179299',
        '#bcc0cc',
      ]
    ),
  },
  { id: 'solarized', name: 'Solarized', dark: solarized('dark'), light: solarized('light') },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    dark: theme(
      { background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', selection: '#665c5499' },
      [
        '#282828',
        '#cc241d',
        '#98971a',
        '#d79921',
        '#458588',
        '#b16286',
        '#689d6a',
        '#a89984',
        '#928374',
        '#fb4934',
        '#b8bb26',
        '#fabd2f',
        '#83a598',
        '#d3869b',
        '#8ec07c',
        '#ebdbb2',
      ]
    ),
    light: theme(
      { background: '#fbf1c7', foreground: '#3c3836', cursor: '#3c3836', selection: '#d5c4a199' },
      [
        '#fbf1c7',
        '#cc241d',
        '#98971a',
        '#d79921',
        '#458588',
        '#b16286',
        '#689d6a',
        '#7c6f64',
        '#928374',
        '#9d0006',
        '#79740e',
        '#b57614',
        '#076678',
        '#8f3f71',
        '#427b58',
        '#3c3836',
      ]
    ),
  },
];

export function isTerminalSchemeId(value: unknown): value is TerminalSchemeId {
  return TERMINAL_SCHEME_IDS.includes(value as TerminalSchemeId);
}

/** The xterm.js theme for a scheme in light or dark mode; unknown ids get Flare's. */
export function terminalTheme(id: TerminalSchemeId, mode: 'light' | 'dark'): TerminalTheme {
  const scheme = TERMINAL_SCHEMES.find((candidate) => candidate.id === id) ?? TERMINAL_SCHEMES[0];
  return scheme[mode];
}
