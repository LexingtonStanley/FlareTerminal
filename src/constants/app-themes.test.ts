import { APP_THEMES, appTheme, type AppThemeId } from './app-themes';
import { FontRoles, type TerminalTheme } from './theme';

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

const TERMINAL_KEYS: (keyof TerminalTheme)[] = [
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

const variants = APP_THEMES.flatMap((theme) =>
  (['light', 'dark'] as const).map((mode) => ({ name: `${theme.id}, ${mode}`, ...theme[mode] }))
);

describe('app themes', () => {
  it('has unique ids and names', () => {
    expect(new Set(APP_THEMES.map(({ id }) => id)).size).toBe(APP_THEMES.length);
    expect(new Set(APP_THEMES.map(({ name }) => name)).size).toBe(APP_THEMES.length);
  });

  it('picks the variant for the mode, and Flare for an unknown id', () => {
    expect(appTheme('gruvbox', 'dark').terminal.background).toBe('#282828');
    expect(appTheme('gruvbox', 'light').terminal.background.toLowerCase()).toBe('#fbf1c7');
    expect(appTheme('nope' as AppThemeId, 'dark')).toBe(appTheme('flare', 'dark'));
  });

  describe.each(variants)('$name', ({ colors, terminal, shape }) => {
    it('sets every colour xterm.js draws with', () => {
      for (const key of TERMINAL_KEYS)
        expect(terminal[key]).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
    });

    it('draws the terminal on the app’s background, so the terminal is the screen', () => {
      expect(terminal.background.toLowerCase()).toBe(colors.background.toLowerCase());
    });

    it('keeps text, the accent as text, attention and danger readable (WCAG AA)', () => {
      const readable = ['text', 'textSecondary', 'primaryText', 'attention', 'danger'] as const;
      const unreadable = (['background', 'backgroundElement'] as const).flatMap((surface) =>
        readable
          .filter((key) => contrast(colors[key], colors[surface]) < 4.5)
          .map((key) => `${key} on ${surface}`)
      );
      expect(unreadable).toEqual([]);
    });

    it('keeps labels on the accent and on keys readable', () => {
      expect(contrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.text, colors.key)).toBeGreaterThanOrEqual(4.5);
    });

    it('uses faces the app loads, at the weights its roles ask for', () => {
      expect(Object.keys(FontRoles)).toEqual(expect.arrayContaining(Object.values(shape.fonts)));
    });
  });

  describe.each(['light', 'dark'] as const)('Flare, %s', (mode) => {
    const { terminal } = appTheme('flare', mode);

    it('keeps text and the six main colours readable (WCAG AA)', () => {
      const main = ['foreground', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const;
      const unreadable = main.filter((key) => contrast(terminal[key], terminal.background) < 4.5);
      expect(unreadable).toEqual([]);
    });

    // The other palettes are kept as published, where some dim colours sit near 3:1.
    it('keeps dim text (bright black) and the cursor visible', () => {
      expect(contrast(terminal.brightBlack, terminal.background)).toBeGreaterThanOrEqual(3);
      expect(contrast(terminal.cursor, terminal.background)).toBeGreaterThanOrEqual(3);
    });
  });
});
