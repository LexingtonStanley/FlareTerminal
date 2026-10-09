import { StyleSheet, type TextStyle } from 'react-native';

import {
  appTheme,
  type AppThemeId,
  type ThemeShape,
  type ThemeVariant,
} from '@/constants/app-themes';
import { font, type FontWeight, type Theme } from '@/constants/theme';
import { useAppearance } from '@/features/settings/preferences-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** The chosen theme in the current mode: its colours, terminal colours and shape. */
export function useAppTheme(): ThemeVariant & { id: AppThemeId; mode: 'light' | 'dark' } {
  const { appTheme: id } = useAppearance();
  const mode = useColorScheme();
  return { id, mode, ...appTheme(id, mode) };
}

/** The theme's colours. */
export function useTheme(): Theme {
  return useAppTheme().colors;
}

export type Shape = ThemeShape & {
  /** borderWidth as a width to draw: a true hairline when the theme says 1. */
  hairline: number;
};

/** The theme's corners, borders, shadows and press feel. */
export function useShape(): Shape {
  const { shape } = useAppTheme();
  return {
    ...shape,
    hairline: shape.borderWidth === 1 ? StyleSheet.hairlineWidth : shape.borderWidth,
  };
}

/** Several boxShadow values as one, skipping the theme's 'none's; undefined if none is left. */
export function shadows(...values: (string | false | null | undefined)[]): string | undefined {
  const drawn = values.filter((value): value is string => !!value && value !== 'none');
  return drawn.length ? drawn.join(', ') : undefined;
}

export type Type = {
  /** The face for everything people read. */
  sans(weight?: FontWeight): Pick<TextStyle, 'fontFamily'>;
  /** The face for what a computer types or reads: hosts, commands, keys. */
  mono(weight?: FontWeight): Pick<TextStyle, 'fontFamily'>;
  /** Screen headings (title, subtitle): the theme's display face, weight, case and glow. */
  display: TextStyle;
  /** Section headings (overline): the theme's label face, weight, case and tracking. */
  label: TextStyle;
  /** The wordmark's and display text's glow, if the theme has one. */
  glow: TextStyle;
};

/** The theme's typefaces. Fonts are per-weight families, so never set fontWeight. */
export function useType(): Type {
  const { fonts, ...shape } = useAppTheme().shape;
  const glow: TextStyle = shape.textGlow
    ? {
        textShadowColor: shape.textGlow.color,
        textShadowRadius: shape.textGlow.radius,
        textShadowOffset: { width: 0, height: 0 },
      }
    : {};
  return {
    sans: (weight = 400) => font(fonts.ui, weight),
    mono: (weight = 400) => font(fonts.mono, weight),
    display: {
      ...font(fonts.display, shape.displayWeight),
      textTransform: shape.displayCase,
      ...glow,
    },
    label: {
      ...font(fonts.label, shape.labelWeight),
      letterSpacing: shape.labelTracking,
      textTransform: shape.labelCase,
    },
    glow,
  };
}
