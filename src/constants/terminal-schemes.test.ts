import { TERMINAL_SCHEMES, terminalTheme, type TerminalSchemeId } from './terminal-schemes';
import { Colors, TerminalColors, type TerminalTheme } from './theme';

/** WCAG relative luminance and contrast ratio of two #rrggbb colours. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const KEYS: (keyof TerminalTheme)[] = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
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

describe('terminal colour schemes', () => {
  const variants = TERMINAL_SCHEMES.flatMap(({ id, light, dark }) => [
    { name: `${id}, light`, theme: light },
    { name: `${id}, dark`, theme: dark },
  ]);

  it.each(variants)('$name sets every colour xterm.js draws with', ({ theme }) => {
    for (const key of KEYS) expect(theme[key]).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
  });

  it('has unique ids and names', () => {
    expect(new Set(TERMINAL_SCHEMES.map(({ id }) => id)).size).toBe(TERMINAL_SCHEMES.length);
    expect(new Set(TERMINAL_SCHEMES.map(({ name }) => name)).size).toBe(TERMINAL_SCHEMES.length);
  });

  it('picks the variant for the appearance, and Flare for an unknown id', () => {
    expect(terminalTheme('gruvbox', 'dark').background).toBe('#282828');
    expect(terminalTheme('gruvbox', 'light').background).toBe('#fbf1c7');
    expect(terminalTheme('nope' as TerminalSchemeId, 'dark')).toBe(TerminalColors.dark);
  });

  describe.each(['light', 'dark'] as const)('Flare, %s', (mode) => {
    const theme = TerminalColors[mode];

    it('is the app’s background, so the terminal is the screen', () => {
      expect(theme.background).toBe(Colors[mode].background);
    });

    it('keeps text and the six main colours readable (WCAG AA)', () => {
      const main = ['foreground', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const;
      const unreadable = main.filter((key) => contrast(theme[key], theme.background) < 4.5);
      expect(unreadable).toEqual([]);
    });

    it('keeps dim text (bright black) and the cursor visible', () => {
      expect(contrast(theme.brightBlack, theme.background)).toBeGreaterThanOrEqual(3);
      expect(contrast(theme.cursor, theme.background)).toBeGreaterThanOrEqual(3);
    });
  });
});
