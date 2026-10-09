# Design

Flare is a pro tool people use for hours, on a phone, often at night. It should feel calm,
high-contrast and fast: closer to Linear, Ghostty or Termius than to a consumer app. The look
is built from a few tokens in `src/constants/theme.ts`; screens take them from `useTheme()`,
`sans()` and `mono()`, never as literals.

## Direction

- **Ink and ember.** Dark mode is deep ink with a cool cast; the one accent is a warm ember,
  so whatever carries it glows. Light mode is warm paper with white cards and ink text, a
  daylight version rather than an inversion.
- **One accent, used sparingly.** Ember marks the main action on a screen, focus, what is
  live (the current session tab, the cursor, Enter, an armed modifier) and agents asking for
  you. Everything else is ink, grey and hairlines. If two things on a screen are ember and
  only one needs a thumb, make the other neutral.
- **Monospace means machine.** Geist Mono is for what a computer types or reads: hosts,
  addresses, commands, paths, fingerprints, keys, the wordmark. Everything people read is
  Geist.
- **Quiet surfaces.** Cards are a step lighter (dark) or white (light) with a hairline border,
  not a shadow. Only floating things (the attention banner, the key bubble) cast one.
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
| `primary`               | Ember: the main button, focus rings, selection, the live tab                            |
| `onPrimary`             | Text and icons on `primary` (white by day, ink at night)                                |
| `primaryMuted`          | A quiet ember tint behind selected chips and badges                                     |
| `attention`             | An agent asking for you: banner edge, row edge, bell, strip dot                         |
| `success`               | Connected                                                                               |
| `warning`               | Connecting (the dot breathes)                                                           |
| `danger`                | Disconnected, errors, destructive actions                                               |
| `shadow`                | The colour of the few shadows                                                           |
| `keyboard` … `keyArmed` | The in-app keyboard: tray, character keys, function keys, key shadow, one-shot modifier |

Text tokens clear WCAG AA (4.5:1) on every surface they're used on, in both modes. Check new
pairs before adding them; `src/constants/terminal-schemes.test.ts` shows how.

Status always pairs a colour with a word ("Connected") or an icon, never colour alone.

## Type

Geist and Geist Mono (SIL OFL 1.1, `assets/fonts`) load before the splash screen hides. Each
weight is its own family, so styles use `sans(600)` or `mono(500)` and never `fontWeight`
(Android and iOS only find a custom font's weights by name).

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
- Radii come from `Radius`: `small` (8) for keys and wells, `medium` (12) for fields, buttons
  and rows, `large` (16) for cards and banners, `pill` for chips and badges.
- Touch targets are at least 40 points; icon-only buttons use `IconButton`.
- Pressed states darken the surface (`backgroundSelected`); buttons also shrink slightly.

## Components

Build screens from `src/components/ui/`: `Screen`, `Section` (overline heading and content),
`Card` (`flush` for row lists, with `Divider`), `Button` (`primary`, `secondary`, `danger`,
`ghost`; `small`; optional `icon`), `IconButton`, `Icon` (one name per meaning, SF Symbols on
iOS, Material Symbols elsewhere), `TextField` (`monospace` for machine input, `hint`),
`SegmentedControl` and `Callout` (`info`, `warning`). Status lights are `LiveDot` and
`StatusBadge` in `src/features/sessions/session-status.tsx`.

## The terminal

`TerminalColors` in `theme.ts` is Flare's scheme: the app's background, ember cursor, and 16
ANSI colours tuned for each mode (the six main colours clear 4.5:1). Settings offers Tokyo
Night, Catppuccin, Solarized and Gruvbox too (`src/constants/terminal-schemes.ts`), each with
a light and a dark variant that follows the phone. `useTerminalTheme()` gives the current one.

## The keyboard

Keys are drawn by `src/features/keyboard/key-cap.tsx` from the `keyboard`, `key`,
`keyFunction`, `keyShadow` and `keyArmed` tokens: character keys raised on the tray, quieter
function keys, Enter in ember. Letters are Geist; punctuation and the terminal's own keys
(esc, tab, ctrl, F1) are Geist Mono. A one-shot modifier is tinted with a dot, a locked one
filled ember with a bar.

## Checklist for new UI

1. Colours from `useTheme()`, type from `ThemedText` or `sans()`/`mono()`, space from
   `Spacing`, corners from `Radius`.
2. At most one ember action per screen.
3. Look at it in light and dark mode, at 360 points wide.
4. Accessible names with `role` and `aria-label`; icons are decorative.
