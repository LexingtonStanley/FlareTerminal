# The coding keyboard

Flare Terminal's own keys for driving shells, tmux, vim and agent CLIs from a phone. There
are two modes, both inside the app:

- **Mode A, the accessory bar**: one row above the phone's keyboard with what it lacks.
- **Mode B, the coding keyboard**: a full keyboard that replaces the phone's while in the
  terminal. No autocorrect, no IME, every key reaches the terminal as typed.

The bar is the top row of the coding keyboard, so Esc, Ctrl and the arrows never move. Try
both at `/keyboard-preview` (in the app, or `npm start` then `w`).

## Mode A: the accessory bar

```
┌─────┬─────┬─────┬─────┬───────────┬─────┬─────┬─────┐
│     │ ⇧tab│  ^C │     │     ▲     │  ~  │  \  │     │
│ esc │ tab │ ctrl│ alt │ ◀   ●   ▶ │< | >│[ / ]│  ⌨  │
│     │     │     │     │     ▼     │  `  │  -  │     │
└─────┴─────┴─────┴─────┴───────────┴─────┴─────┴─────┘
  tap   tap   tap   tap   joystick    flick to the     open
        ↑flick ↑flick     (2 wide)    symbol shown     Mode B
```

| Key       | Tap               | Flick / hold                                                    |
| --------- | ----------------- | --------------------------------------------------------------- |
| esc       | Esc (interrupt)   |                                                                 |
| tab       | Tab               | flick up: Shift+Tab (Claude Code's mode switch)                 |
| ctrl, alt | sticky, next key  | double tap or hold: lock · flick up on ctrl: Ctrl-C             |
| arrows    | the side you tap  | flick: one arrow · hold off-centre: repeat · hold still: paging |
| `\|` `/`  | the centre symbol | flick towards a symbol to type it                               |
| ⌨         | coding keyboard   |                                                                 |

Every key is at least 40 points wide on a 375-point phone (iPhone SE/mini and up).

## Mode B: the coding keyboard

```
 esc  tab  ctrl  alt  [ ◀ ▲▼ ▶ ]  |  /  🌐        ← the bar, with 🌐 back to the phone's keyboard
  1    2    3    4    5    6    7    8    9    0   ← flick up (digits)
  q    w    e    r    t    y    u    i    o    p
    @    #    $    _    &    =    +    (    )
    a    s    d    f    g    h    j    k    l
         *    "    '    :    ;    !    ?
  ⇧     z    x    c    v    b    n    m     ⌫     ← ⌫ flick left: delete word (^W)
  fn    _              ,   ^J
 123    -    [   space    ]  .    ⏎             ← slide on space: arrows · ⏎ flick up: newline
```

**Symbols** (`123`): every symbol a shell needs in one tap or one flick. Digits carry their
US shifted pair one flick up (`1`→`!` … `0`→`)`), as do `-`→`_`, `=`→`+`, `/`→`?`, `;`→`:`,
`'`→`` ` `` and `.`→`,`.

```
  1  2  3  4  5  6  7  8  9  0
  -  =  /  \  |  &  $  ;  '  "
 fn  (  )  [  ]  {  }  <  >  ⌫
abc  ~  [   space   ]  .  ⏎
```

**Navigation** (`fn`, or flick up on `123`): F1–F12, an inverted-T arrow cluster for people
who prefer keys to the joystick, Home/End, PgUp/PgDn, Insert/Delete.

```
 F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12
 home    ↑    end   pgup   ins
  ←      ↓     →    pgdn   del
 abc   123  [  space  ]    ⏎
```

Shift: tap for one capital, double tap or hold for caps lock, or hold it with one thumb
while typing with the other. Shift+Tab also works as Shift then Tab.

## Gestures

| Gesture             | What it does                                                        | Tuning                  |
| ------------------- | ------------------------------------------------------------------- | ----------------------- |
| Tap                 | The key, sent on release                                            |                         |
| Flick               | The secondary in that direction; up to 60° off still counts         | 18 px of travel         |
| Long press          | The up secondary (Gboard-style); locks a modifier; pages the arrows | 450 ms                  |
| Hold ⌫ or nav keys  | Repeats, speeding up                                                | 400 ms, then 90 → 35 ms |
| Arrows joystick     | One arrow on leaving the centre; hold out to repeat, faster further | 12 px; 160 → 30 ms      |
| Arrows, hold still  | Paging: ◀ Home, ▶ End, ▲ PgUp, ▼ PgDn                               | 450 ms                  |
| Slide on space      | Cursor arrows, like the iOS space-bar trackpad                      | 12 px across, 22 px up  |
| Two thumbs          | A waiting key is sent when the next goes down, so order is kept     |                         |
| Chord               | Hold ctrl/alt/shift with one thumb, tap a key with the other        |                         |
| Double tap modifier | Lock (tap again to unlock)                                          | 350 ms                  |

While a key is down a bubble above it shows what releasing will send, with the flick options
around it and the chosen one highlighted; moving back to the centre cancels a flick. The
joystick's nub follows the finger and lights the arrow it is sending.

Modifier states: **off** (grey), **once** (tinted, dot: applies to the next key, then
releases), **locked** (filled, bar). Screen readers hear a switch, checked, with the value
"once" or "locked".

## Why it is shaped like this

- **Agent keys first.** Claude Code is driven with Esc (interrupt), Shift+Tab (modes),
  Ctrl-C, arrows and Enter to pick options, and `/` `@` `!` to start commands, mentions and
  shell mode. All are one tap or one flick, and they never move between modes.
- **Fixed positions, no scrolling.** The old bar scrolled; a key that moves can't be found by
  thumb. Fixed rows build muscle memory (Thumb-Key, Unexpected Keyboard).
- **One row for Mode A.** Above the phone's keyboard every point of height comes out of the
  terminal. Flicks fit 16 outputs into 8 keys; the symbols chosen are the ones iOS and Gboard
  bury two layers deep (`| ~ \ \` < > [ ]`).
- **Thumb reach.** The bar sits mid-screen, reachable by both thumbs; the joystick is just
  right of centre for the right thumb. Esc sits at the left edge, where an edge target is
  easiest to hit (the touch can't overshoot).
- **No dead zones.** The whole keyboard is one touch surface that gives every touch to the
  nearest key: gaps, the QWERTY stagger and the screen edges all count, which makes each key's
  real target its full slot (about 39 × 50 points on a 390-point phone for letters, like iOS).
- **Error tolerance.** Flicks have a generous cone; small wobbles stay taps; the bubble shows
  the outcome before release; the joystick has hysteresis at its centre and near diagonals;
  sliding on space forgets sideways drift.
- **Two ways to everything.** Every flick is also a long press (up) or an accessibility
  action, and the nav layer has plain arrow keys for anyone who doesn't like the joystick.
- **Haptics.** A light tap per key, a detent per flick option and per arrow step, a firmer
  bump for a lock. On Android these are the system keyboard's own haptic constants.

## What was borrowed

| From                     | Idea                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Termux extra keys        | Swipe up for a second symbol; ESC/TAB/CTRL/ALT and arrows above the keyboard                      |
| Unexpected Keyboard      | Several symbols per key by flick direction; tap to latch, double tap to lock                      |
| Japanese flick keyboards | The cross-shaped guide that shows all five options while the finger is down                       |
| Moshi, Blink Shell       | Sticky Ctrl/Alt on the bar; Moshi's 400 ms double tap to lock                                     |
| iOS space-bar trackpad   | Slide on space to move the cursor                                                                 |
| Termius, iSH             | Arrows by dragging, repeating faster the longer or further you hold                               |
| Gboard                   | Long press for the hinted symbol, its symbol hints, swipe left on ⌫                               |
| Hacker's Keyboard        | A real nav cluster and F-keys, but on a layer, since a 5-row PC layout is too cramped in portrait |
| Thumb-Key                | Big fixed targets over many small ones                                                            |
| a-Shell                  | A short, purpose-built toolbar instead of a copy of a desktop keyboard                            |

## How it fits together

All logic is pure and tested; components only route touches and draw.

| File (`src/features/keyboard/`)            | Role                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `layout.ts`                                | The layouts as data: keys, flicks, layers                                                   |
| `geometry.ts`                              | Key rectangles at a width; nearest-key hit test                                             |
| `gestures.ts`                              | One finger's gesture as a state machine: tap, flick, long press, repeat, joystick, trackpad |
| `touch-tracker.ts`                         | Several fingers: rollover, chords, timers                                                   |
| `modifiers.ts`                             | `ModifierState` (off/once/locked), `afterInput`, `toModifiers`                              |
| `keyboard-state.ts`                        | Turns actions into text, keys, modifier changes, Shift and layers                           |
| `key-surface.tsx`, `key-cap.tsx`           | The touch surface and how keys look                                                         |
| `accessory-bar.tsx`, `coding-keyboard.tsx` | Mode A and Mode B                                                                           |

Ctrl and Alt state belongs to the terminal session (the composer and typing straight into
the terminal use it too); the keyboards show it and change it through
`onModifiersChange`. The session applies armed modifiers to the next input and calls
`afterInput`. In Mode B the terminal view gets `systemKeyboard={false}`, which keeps it
focused (cursor, hardware keyboards) but asks for no on-screen keyboard (`inputmode="none"`).

## Needs a device

The web tests prove layout, gestures, focus and the bytes sent. Still to check on phones:
haptics; that `inputmode="none"` keeps the iOS and Android keyboards away inside the
WebView, and that switching back brings the keyboard up (iOS may need a tap on the terminal);
multi-touch rollover and chords with real thumbs; VoiceOver and TalkBack actions; the iOS
back-swipe at the left edge cancelling a touch on Esc; timing constants on a real screen.

## Ideas for later

- **A system-wide keyboard**: an iOS custom keyboard extension and an Android
  `InputMethodService`, reusing these layouts and gestures (as data), so the same keys work in
  any SSH app. Both need native targets (an Expo config plugin), and iOS extensions have tight
  memory limits and no network by default.
- Ctrl/Alt with arrows as xterm modified sequences (`\x1b[1;5D` for Ctrl+←), for word jumps.
- An agent row: one-tap `/clear`, `/compact`, `#`, `!`, tmux prefix + key, user snippets.
- Layout settings: left-handed mirror, which symbols sit on the bar, flick sensitivity, bigger
  keys, landscape layout.
- Slide from `123` onto a symbol and release to type it and come straight back (iOS does
  this), and slide to the neighbouring key to correct a mis-tap.
- Swipe typing for prose prompts (for now: the globe key, then the phone's keyboard or the
  composer with dictation).
