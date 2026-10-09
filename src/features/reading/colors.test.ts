import { appTheme } from '@/constants/app-themes';
import type { Type } from '@/hooks/use-theme';

import { contrast, palette, spanStyle } from './colors';

const light = appTheme('flare', 'light').terminal;
const dark = appTheme('flare', 'dark').terminal;
const mono: Type['mono'] = (weight = 400) => ({ fontFamily: `Mono-${weight}` });

describe('palette', () => {
  it('has the theme’s 16 colours, then the 6×6×6 cube and 24 greys', () => {
    const colors = palette(dark);
    expect(colors).toHaveLength(256);
    expect(colors[1]).toBe(dark.red);
    expect(colors[15]).toBe(dark.brightWhite);
    expect(colors[16]).toBe('#000000');
    expect(colors[208]).toBe('#ff8700');
    expect(colors[231]).toBe('#ffffff');
    expect(colors[232]).toBe('#080808');
    expect(colors[237]).toBe('#3a3a3a');
    expect(colors[255]).toBe('#eeeeee');
  });
});

describe('spanStyle', () => {
  const colors = palette(light);

  it('leaves plain text to the block', () => {
    expect(spanStyle({ text: 'x' }, colors, light, mono)).toBeUndefined();
  });

  it('draws colours, bold, italic, underline and strike', () => {
    expect(
      spanStyle(
        {
          text: 'x',
          fg: 2,
          bg: '#102030',
          bold: true,
          italic: true,
          underline: true,
          strike: true,
        },
        colors,
        light,
        mono
      )
    ).toEqual({
      color: light.green,
      backgroundColor: '#102030',
      fontFamily: 'Mono-600',
      fontStyle: 'italic',
      textDecorationLine: 'underline line-through',
    });
  });

  it('swaps the colours of inverse text, the defaults too', () => {
    expect(spanStyle({ text: 'x', inverse: true }, colors, light, mono)).toEqual({
      color: light.background,
      backgroundColor: light.foreground,
    });
  });

  it('fades dim text', () => {
    expect(spanStyle({ text: 'x', fg: '#336699', dim: true }, colors, light, mono)).toEqual({
      color: '#33669999',
    });
  });

  it('keeps default text readable on a background a program chose', () => {
    // Claude Code's prompt shading: dark grey, made for dark terminals.
    const style = spanStyle({ text: 'x', bg: 237 }, colors, light, mono)!;
    expect(style.color).toBe(light.background);
    expect(contrast(style.color as string, '#3a3a3a')).toBeGreaterThan(4.5);
    expect(spanStyle({ text: 'x', bg: 237 }, palette(dark), dark, mono)!.color).toBe(
      dark.foreground
    );
  });
});
