# Design

Flare is a pro tool people use for hours, on a phone, often at night. It should feel calm,
high-contrast and fast: closer to Linear, Ghostty or Termius than to a consumer app. The look
is built from a few tokens per theme (`src/constants/app-themes.ts`, with type and spacing in
`src/constants/theme.ts`); screens take them from `useTheme()`, `useShape()` and `useType()`
(`src/hooks/use-theme.ts`), never as literals.

## Themes

Flare has ten themes, each with a light and a dark variant. A theme sets three things
together: the app's colours, the terminal's 16 ANSI colours, and its shape (typefaces,
corners, borders, shadows, glow, the press). Settings picks the theme and whether light or
dark follows the phone; `useColorScheme()` gives the result.

| Family     | Themes                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Signature  | **Flare**, the default: ink and ember                                                           |
| Terminal   | **Phosphor** (green CRT, all mono), **Tokyo Night**, **Catppuccin**, **Gruvbox**, **Solarized** |
| Modern     | **Graphite**: neutral, larger radii, soft elevation, signal lime                                |
| Futuristic | **Orbit**: HUD corners, Chakra Petch headings, tracked mono labels, cyan and orange             |
| Neon       | **Neon**: magenta tubes, cyan attention, glow on what's live, Tilt Neon headings                |
| Brutalist  | **Concrete**: square, 2pt rules, hard offset shadows, IBM Plex Mono, safety yellow              |

The rules below hold in every theme. Where this page says ember, read the theme's accent.

## Direction

- **Ink and ember.** Dark mode is deep ink with a cool cast; the one accent is a warm ember,
  so whatever carries it glows. Light mode is warm paper with white cards and ink text, a
  daylight version rather than an inversion.
- **One accent, used sparingly.** Ember marks the main action on a screen, focus, what is
  live (the current session tab, the cursor, Enter, an armed modifier) and agents asking for
  you. Everything else is ink, grey and hairlines. If two things on a screen are ember and
  only one needs a thumb, make the other neutral.
- **Monospace means machine.** The mono face (Geist Mono) is for what a computer types or
  reads: hosts, addresses, commands, paths, fingerprints, keys, the wordmark. Everything
  people read is the UI face (Geist), except in Phosphor and Concrete, which are all mono.
- **Quiet surfaces.** Cards are a step lighter (dark) or white (light) with a hairline border,
  not a shadow (Graphite's soft and Concrete's hard shadows are the exceptions). Only
  floating things (the attention banner, the key bubble) cast one.
- **The terminal is the screen.** The default terminal scheme uses the app's background, so
  the session screen has no box around the terminal.

## Colour

| Token                   | Use                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `background`            | The canvas: screens, headers, the tab bar, the terminal                                 |
| `backgroundElement`     | Cards, rows, fields, chips                                                              |
| `backgroundSelected`    | Pressed rows, tracks, wells for code inside a card, info callouts                       |
| `backgroundRaised`      | Floating things: banners, the key bubble, the segmented thumb (dark)                    |
| `border`                | Hairlines around cards and fields, dividers                                             |
| `text`                  | Primary text and icons                                                                  |
| `textSecondary`         | Secondary text, labels, placeholders, idle icons                                        |
| `primary`               | Ember: fills, borders, focus rings, the cursor, the live tab's underline                |
| `primaryText`           | The accent as text or an icon on a surface (ghost buttons, selected chips' labels)      |
| `onPrimary`             | Text and icons on `primary` (white by day, ink at night)                                |
| `primaryBorder`         | The border on `primary` fills (only Concrete draws one)                                 |
| `primaryMuted`          | A quiet ember tint behind selected chips and badges                                     |
| `attention`             | An agent asking for you: banner edge, row edge, bell, strip dot                         |
| `success`               | Connected                                                                               |
| `warning`               | Connecting (the dot breathes)                                                           |
| `danger`                | Disconnected, errors, destructive actions                                               |
| `shadow`                | The colour of the few shadows                                                           |
| `segmentTrack/Thumb`    | The segmented control's track and selected thumb                                        |
| `keyboard` … `keyArmed` | The in-app keyboard: tray, character keys, function keys, key shadow, one-shot modifier |

Text tokens clear WCAG AA (4.5:1) on every surface they're used on, in both modes. Check new
pairs before adding them; `src/constants/app-themes.test.ts` checks every theme in both modes.
`primary` and `primaryText` are the same except where the accent is too light to read as text
(Graphite's lime by day, Concrete's yellow), so use `primaryText` for any accent-coloured
text or icon. `ThemedText`'s `themeColor="primary"` does this for you.

Status always pairs a colour with a word ("Connected") or an icon, never colour alone.

## Type

Geist, Geist Mono, Chakra Petch, Tilt Neon and IBM Plex Mono (SIL OFL 1.1, `assets/fonts`)
load before the splash screen hides. Each weight is its own family, so styles use
`useType()`'s `sans(600)` or `mono(500)` and never `fontWeight` (Android and iOS only find a
custom font's weights by name). A theme picks a face for four roles: `ui` (everything people
read), `display` (`title`, `subtitle`, with its weight, case, tracking and glow), `label`
(`overline`) and `mono` (`code`, the wordmark). Most themes are Geist and Geist Mono;
Phosphor and Concrete set everything in mono on purpose.

| `ThemedText` type | Size | Use                                      |
| ----------------- | ---- | ---------------------------------------- |
| `title`           | 34   | Rare; a hero heading                     |
| `subtitle`        | 26   | A screen's heading                       |
| `headline`        | 17   | A card's or row's title                  |
| `default`         | 16   | Body text                                |
| `small`           | 14   | Secondary lines, notes                   |
| `smallBold`       | 14   | Emphasis at body size                    |
| `overline`        | 12   | A section's heading (uppercase, tracked) |
| `eyebrow`         | 13   | A field's label                          |
| `caption`         | 12   | Fine print, counts                       |
| `code`            | 13   | Monospace: hosts, commands, fingerprints |

## Space and shape

- Spacing comes from `Spacing` (4-point steps). Screens have a 24-point gutter; sections are
  28 points apart; things inside a section 8 to 12.
- Corners come from `useShape().radius`: `small` (8 in Flare) for wells, `medium` (12) for
  fields, buttons and rows, `large` (16) for cards and banners, `pill` for chips and badges,
  `key` for the keyboard and `dot` for status lights (square in Concrete). Borders are
  `hairline` (2 points in Concrete); a selected picker tile uses `borderWidthStrong`.
- Shadows come from the shape too: `shadowCard` (Graphite and Concrete only), `shadowFloat`
  for banners and the key bubble, `shadowControl` on secondary buttons (Concrete), and
  `glowPrimary` on primary fills, Enter, the wordmark's cursor and the live underline.
  `shadows()` joins them and skips a theme's `none`.
- Touch targets are at least 40 points; icon-only buttons use `IconButton`.
- Pressed states darken the surface (`backgroundSelected`); buttons also shrink slightly
  (`pressScale`), or press into their hard shadow in Concrete (`pressShift`).

## Components

Build screens from `src/components/ui/`: `Screen`, `Section` (overline heading and content),
`Card` (`flush` for row lists, with `Divider`), `Button` (`primary`, `secondary`, `danger`,
`ghost`; `small`; optional `icon`), `IconButton`, `Icon` (one name per meaning, SF Symbols on
iOS, Material Symbols elsewhere), `TextField` (`monospace` for machine input, `hint`),
`SegmentedControl` and `Callout` (`info`, `warning`). Status lights are `LiveDot` and
`StatusBadge` in `src/features/sessions/session-status.tsx`.

## The terminal

Each theme carries its terminal colours, on the app's background so the terminal is the
screen. Flare's use an ember cursor and 16 ANSI colours tuned for each mode (the six main
colours clear 4.5:1); Tokyo Night, Catppuccin, Solarized and Gruvbox keep their published
palettes. `useTerminalTheme()` gives the current one. The terminal draws in the system's
monospace, not the theme's mono face (it runs in a WebView without the app's fonts).

## The keyboard

Keys are drawn by `src/features/keyboard/key-cap.tsx` from the `keyboard`, `key`,
`keyFunction`, `keyShadow` and `keyArmed` tokens: character keys raised on the tray, quieter
function keys, Enter in ember. Letters are the theme's UI face; punctuation and the
terminal's own keys (esc, tab, ctrl, F1) its mono face. A one-shot modifier is tinted with a dot, a locked one
filled ember with a bar.

## Checklist for new UI

1. Colours from `useTheme()`, type from `ThemedText` or `useType()`, space from `Spacing`,
   corners, borders and shadows from `useShape()`.
2. At most one ember action per screen.
3. Look at it in light and dark mode, at 360 points wide, in Flare and in Concrete (the
   theme furthest from it).
4. Accessible names with `role` and `aria-label`; icons are decorative.
