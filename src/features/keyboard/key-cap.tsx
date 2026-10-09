import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import type { Theme } from '@/constants/theme';
import { shadows, useShape, useType, type Type } from '@/hooks/use-theme';

import type { Point, Rect } from './geometry';
import { DIRECTIONS, type Direction, type KeyDef, type Secondary } from './layout';
import type { ModifierMode } from './modifiers';

/**
 * How keys look. Purely presentational: the surface owns touches and passes in what
 * each key is doing. Character keys are raised on a tray with quieter function keys, as
 * on the iOS and Gboard keyboards, so the layout reads at a glance. Letters are set in the
 * theme's UI face; punctuation and the terminal's own keys (esc, tab, ctrl, F1) in its mono
 * face, so ' and ` or | and l can't be confused. The accent marks what is live: Enter, an
 * armed modifier, the flick the finger has chosen.
 */

type SymbolName = SymbolViewProps['name'];

const ICONS = {
  keyboard: { ios: 'keyboard', android: 'keyboard', web: 'keyboard' },
  hide: {
    ios: 'keyboard.chevron.compact.down',
    android: 'keyboard_hide',
    web: 'keyboard_hide',
  },
  backspace: { ios: 'delete.left', android: 'backspace', web: 'backspace' },
  return: { ios: 'return', android: 'keyboard_return', web: 'keyboard_return' },
  shift: { ios: 'shift', android: 'shift', web: 'shift' },
  shiftOn: { ios: 'shift.fill', android: 'shift', web: 'shift' },
  capsLock: { ios: 'capslock.fill', android: 'keyboard_capslock', web: 'keyboard_capslock' },
} satisfies Record<string, SymbolName>;

type IconName = keyof typeof ICONS;

function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} weight="medium" />;
}

export type KeyVisualState = {
  pressed: boolean;
  /** Flick the release would send, or the direction the arrows key is pushed. */
  direction: Direction | null;
  /** Arrows key: paging (Home/End/PgUp/PgDn) after a long press. */
  paging: boolean;
  /** Arrows key: how far the finger has moved from where it pressed. */
  offset: Point | null;
};

export const IDLE: KeyVisualState = {
  pressed: false,
  direction: null,
  paging: false,
  offset: null,
};

type KeyCapProps = {
  def: KeyDef;
  label: string;
  mode: ModifierMode | null;
  state: KeyVisualState;
  theme: Theme;
  compact: boolean;
};

function faceColors(theme: Theme, def: KeyDef, mode: ModifierMode | null, pressed: boolean) {
  if (mode === 'locked') return { background: theme.primary, foreground: theme.onPrimary };
  if (mode === 'once') return { background: theme.keyArmed, foreground: theme.primaryText };
  if (def.tone === 'accent') return { background: theme.primary, foreground: theme.onPrimary };
  if (def.tone === 'char') {
    return { background: pressed ? theme.keyFunction : theme.key, foreground: theme.text };
  }
  return { background: pressed ? theme.key : theme.keyFunction, foreground: theme.text };
}

function visibleHints(def: KeyDef): [Direction, Secondary][] {
  return DIRECTIONS.flatMap((direction) => {
    const secondary = def.flicks[direction];
    return secondary && !secondary.hidden ? [[direction, secondary] as [Direction, Secondary]] : [];
  });
}

function labelStyle(def: KeyDef, label: string, compact: boolean, { sans, mono }: Type): TextStyle {
  if (def.tone === 'char' && /^[a-zA-Z0-9]$/.test(label)) {
    return { ...sans(400), fontSize: 23 };
  }
  // Punctuation in monospace, so ' and ` or | and l can't be confused.
  if (def.tone === 'char' && [...label].length === 1) {
    return { ...mono(400), fontSize: compact ? 18 : 21 };
  }
  if (def.tone === 'char') return { ...mono(500), fontSize: 12 };
  if (/^F\d+$/.test(label)) return { ...mono(500), fontSize: 12 };
  if ([...label].length === 1) return { ...sans(500), fontSize: 19 };
  // "home" on a one-unit key.
  if (def.units <= 1 && [...label].length > 3) {
    return { ...mono(500), fontSize: compact ? 11 : 12, letterSpacing: -0.3 };
  }
  return { ...mono(500), fontSize: compact ? 13 : 14, letterSpacing: -0.2 };
}

/** The visible face of one key. */
export function KeyCap({ def, label, mode, state, theme, compact }: KeyCapProps) {
  const { background, foreground } = faceColors(theme, def, mode, state.pressed);
  const shape = useShape();
  const type = useType();
  const hints = visibleHints(def);
  // One hint sits in the corner (like Gboard's digits); several go to their edges.
  const cross = hints.length > 1;
  const secondaryColor =
    mode === 'locked' || def.tone === 'accent' ? foreground : theme.textSecondary;

  return (
    <View
      style={[
        styles.face,
        {
          backgroundColor: background,
          borderRadius: shape.radius.key,
          boxShadow: shadows(
            `0 1px 0 ${theme.keyShadow}`,
            def.tone === 'accent' && shape.glowPrimary
          ),
          opacity: def.tone === 'accent' && state.pressed ? 0.8 : 1,
        },
      ]}>
      {def.behavior === 'arrows' ? (
        <ArrowsFace state={state} theme={theme} />
      ) : def.icon ? (
        // Below a corner hint, like word labels, so "abc" or "del" doesn't touch the icon.
        <View style={hints.length === 1 && styles.belowHint}>
          <Icon name={iconFor(def, mode)} size={compact ? 20 : 22} color={foreground} />
        </View>
      ) : (
        <Text
          numberOfLines={1}
          style={[
            labelStyle(def, label, compact, type),
            { color: def.tone === 'char' && label.length > 1 ? theme.textSecondary : foreground },
            cross && styles.crossLabel,
            // Room for a corner hint above a word label (tab, ctrl, 123).
            hints.length === 1 && def.tone !== 'char' && styles.belowHint,
          ]}>
          {label}
        </Text>
      )}
      {def.behavior === 'modifier' && !def.icon && mode !== null && mode !== 'off' ? (
        <View
          style={[
            mode === 'locked' ? styles.lockBar : styles.onceDot,
            {
              backgroundColor: foreground,
              borderRadius: Math.min(shape.radius.dot, mode === 'locked' ? 1.5 : 2.5),
            },
          ]}
        />
      ) : null}
      {hints.map(([direction, secondary]) => (
        <Text
          key={direction}
          numberOfLines={1}
          style={[
            styles.hint,
            cross ? CROSS_HINT[direction] : styles.cornerHint,
            /^[\x20-\x7e]$/.test(secondary.label) ? type.mono(500) : type.sans(500),
            { color: state.direction === direction ? theme.primaryText : secondaryColor },
          ]}>
          {secondary.label}
        </Text>
      ))}
    </View>
  );
}

function iconFor(def: KeyDef, mode: ModifierMode | null): IconName {
  if (def.icon === 'shift')
    return mode === 'locked' ? 'capsLock' : mode === 'once' ? 'shiftOn' : 'shift';
  return def.icon ?? 'keyboard';
}

const NUB_TRAVEL = { x: 14, y: 8 };

/** The arrows key: four triangles around a thumbstick nub that follows the finger. */
function ArrowsFace({ state, theme }: { state: KeyVisualState; theme: Theme }) {
  const { offset, direction, paging, pressed } = state;
  const nubX = Math.max(-NUB_TRAVEL.x, Math.min(NUB_TRAVEL.x, offset?.x ?? 0));
  const nubY = Math.max(-NUB_TRAVEL.y, Math.min(NUB_TRAVEL.y, offset?.y ?? 0));
  const colorFor = (side: Direction) =>
    direction === side ? theme.primaryText : theme.textSecondary;

  return (
    <View style={StyleSheet.absoluteFill}>
      {DIRECTIONS.map((side) => (
        <View key={side} style={[styles.arrowSlot, ARROW_SLOT[side]]}>
          <Triangle
            direction={side}
            color={colorFor(side)}
            mark={paging ? (side === 'up' || side === 'down' ? 'double' : 'bar') : null}
          />
        </View>
      ))}
      <View style={styles.nubSlot}>
        <View
          style={[
            styles.nub,
            {
              backgroundColor: paging || (pressed && direction) ? theme.primary : theme.key,
              borderColor: paging || (pressed && direction) ? theme.primary : theme.keyShadow,
              transform: [{ translateX: nubX }, { translateY: nubY }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const TRIANGLE = { base: 11, height: 7 };

/**
 * An arrowhead drawn with borders, so it looks the same on every platform. Paging
 * marks it like the keys it sends: a bar for Home and End, doubled for PgUp and PgDn.
 */
function Triangle({
  direction,
  color,
  mark,
}: {
  direction: Direction;
  color: string;
  mark: 'bar' | 'double' | null;
}) {
  const vertical = direction === 'up' || direction === 'down';
  const half = TRIANGLE.base / 2;
  const pointing: Record<Direction, ViewStyle> = {
    up: { borderBottomWidth: TRIANGLE.height, borderBottomColor: color },
    down: { borderTopWidth: TRIANGLE.height, borderTopColor: color },
    left: { borderRightWidth: TRIANGLE.height, borderRightColor: color },
    right: { borderLeftWidth: TRIANGLE.height, borderLeftColor: color },
  };
  const head = (
    <View
      style={[
        styles.triangle,
        vertical
          ? { borderLeftWidth: half, borderRightWidth: half }
          : { borderTopWidth: half, borderBottomWidth: half },
        pointing[direction],
      ]}
    />
  );
  const bar = (
    <View
      style={[
        { backgroundColor: color },
        vertical ? { width: TRIANGLE.base, height: 2 } : { width: 2, height: TRIANGLE.base },
      ]}
    />
  );
  const before = direction === 'left' || direction === 'up';
  return (
    <View style={[styles.triangleGroup, !vertical && styles.row]}>
      {mark === 'bar' && before ? bar : null}
      {head}
      {mark === 'double' ? head : null}
      {mark === 'bar' && !before ? bar : null}
    </View>
  );
}

type BubbleProps = {
  def: KeyDef;
  label: string;
  rect: Rect;
  direction: Direction | null;
  surfaceWidth: number;
  theme: Theme;
};

const CELL = 30;
const CENTER = { width: 40, height: 42 };

/**
 * The preview above a pressed key, where the finger can't hide it: the character that
 * releasing will type, with the flick options around it and the chosen one highlighted.
 */
export function KeyBubble({ def, label, rect, direction, surfaceWidth, theme }: BubbleProps) {
  const shape = useShape();
  const { mono } = useType();
  // The joystick and the trackpad show their state on the key itself.
  if (def.behavior === 'arrows' || def.behavior === 'space') return null;
  const isCharacter = def.tone === 'char' && [...label].length === 1;
  // Function keys only preview a flick (⇧tab, ^C, …); a plain tap needs no bubble.
  if (!isCharacter && !(direction && def.flicks[direction])) return null;

  const options = isCharacter ? def.flicks : {};
  const centerLabel = isCharacter ? label : (def.flicks[direction!]?.label ?? label);
  const centerSelected = !isCharacter || direction === null;
  const centerWidth = isCharacter ? CENTER.width : [...centerLabel].length * 11 + 16;
  const columns = (options.left ? CELL : 0) + centerWidth + (options.right ? CELL : 0);
  const width = Math.max(columns + 8, rect.width + 8);
  const height = (options.up ? CELL : 0) + CENTER.height + (options.down ? CELL : 0) + 8;
  const left = Math.max(2, Math.min(surfaceWidth - width - 2, rect.x + rect.width / 2 - width / 2));
  const top = rect.y - height - 2;

  function cell(side: Direction) {
    const secondary = options[side];
    if (!secondary) return null;
    const selected = direction === side;
    return (
      <View
        style={[
          styles.cell,
          { borderRadius: shape.radius.small },
          selected && { backgroundColor: theme.primary },
        ]}>
        <Text
          style={[
            styles.cellText,
            mono(500),
            { color: selected ? theme.onPrimary : theme.textSecondary },
          ]}>
          {secondary.label}
        </Text>
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      aria-hidden
      style={[
        styles.bubble,
        {
          left,
          top,
          width,
          height,
          backgroundColor: theme.backgroundRaised,
          borderColor: theme.border,
          borderRadius: shape.radius.medium,
          borderWidth: shape.hairline,
          boxShadow: shadows(shape.shadowFloat),
        },
      ]}>
      {cell('up')}
      <View style={styles.bubbleRow}>
        {cell('left')}
        <View
          style={[
            styles.center,
            { borderRadius: Math.min(shape.radius.small + 1, shape.radius.medium) },
            centerSelected && !isCharacter && { backgroundColor: theme.primary },
          ]}>
          <Text
            numberOfLines={1}
            style={[
              styles.centerText,
              mono(isCharacter ? 400 : 600),
              !isCharacter && styles.centerWord,
              {
                color: !isCharacter
                  ? theme.onPrimary
                  : centerSelected
                    ? theme.text
                    : theme.textSecondary,
              },
            ]}>
            {centerLabel}
          </Text>
        </View>
        {cell('right')}
      </View>
      {cell('down')}
    </View>
  );
}

const CROSS_HINT: Record<Direction, TextStyle> = {
  up: { top: 1, left: 0, right: 0, textAlign: 'center' },
  down: { bottom: 1, left: 0, right: 0, textAlign: 'center' },
  left: { left: 4, top: '50%', marginTop: -6 },
  right: { right: 4, top: '50%', marginTop: -6 },
};

const ARROW_SLOT = {
  up: { top: 4, left: 0, right: 0, alignItems: 'center' },
  down: { bottom: 4, left: 0, right: 0, alignItems: 'center' },
  left: { left: 9, top: 0, bottom: 0, justifyContent: 'center' },
  right: { right: 9, top: 0, bottom: 0, justifyContent: 'center' },
} as const;

const styles = StyleSheet.create({
  face: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  crossLabel: { fontSize: 17 },
  belowHint: { marginTop: 7 },
  row: { flexDirection: 'row' },
  triangle: {
    width: 0,
    height: 0,
    borderColor: 'transparent',
  },
  triangleGroup: { alignItems: 'center', justifyContent: 'center', gap: 1 },
  hint: { position: 'absolute', fontSize: 10, lineHeight: 12 },
  cornerHint: { top: 3, right: 5 },
  onceDot: { position: 'absolute', bottom: 4, width: 5, height: 5 },
  lockBar: { position: 'absolute', bottom: 4, width: 14, height: 3 },
  arrowSlot: { position: 'absolute' },
  nubSlot: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  nub: { width: 16, height: 16, borderRadius: 8, borderWidth: 1 },
  bubble: {
    position: 'absolute',
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'center' },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 16 },
  center: {
    minWidth: CENTER.width,
    height: CENTER.height,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: { fontSize: 26 },
  centerWord: { fontSize: 16 },
});
