import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeTouchEvent,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { placeKeys } from './geometry';
import { playHaptic } from './haptics';
import { IDLE, KeyBubble, KeyCap, type KeyVisualState } from './key-cap';
import { NOTHING_HELD } from './keyboard-state';
import {
  ARROW_KEYS,
  DIRECTIONS,
  PAGE_KEYS,
  labelFor,
  type Direction,
  type KeyAction,
  type KeyDef,
  type Row,
} from './layout';
import type { ModifierMode } from './modifiers';
import { TouchTracker, type ActiveKey, type TouchPoint, type TrackerOutput } from './touch-tracker';

export type KeyActionHandler = TrackerOutput['onAction'];

type KeySurfaceProps = {
  rows: Row[];
  /** Accessible name of the whole keyboard. */
  label: string;
  role: 'toolbar' | 'group';
  /** Ctrl and Alt from the session, Shift from the keyboard. */
  modes: { ctrl: ModifierMode; alt: ModifierMode; shift: ModifierMode };
  onAction: KeyActionHandler;
  /** Denser keys for the bar that sits above the phone's keyboard. */
  compact?: boolean;
};

export const SURFACE_PADDING = { top: 4, bottom: 4 };

// On web a pressed key takes focus, which closes a phone's keyboard mid-command, and a
// drag selects text. Cancelling mousedown keeps focus in the terminal; the responder
// system still sees the event. touch-action lets drags reach the keys instead of panning.
const webSurface: object =
  Platform.OS === 'web'
    ? { onMouseDown: (event: { preventDefault(): void }) => event.preventDefault() }
    : {};
const webSurfaceStyle = (
  Platform.OS === 'web' ? { userSelect: 'none', touchAction: 'none', cursor: 'default' } : {}
) as ViewStyle;

// Native touch locations are relative to the view under the finger, so the keys must not
// be touch targets: every touch then lands on the surface itself. On the web the
// responder system measures from the surface anyway, and keys stay clickable (Playwright
// and screen readers click them).
const KEYS_POINTER_EVENTS = Platform.OS === 'web' ? 'box-none' : 'none';

function points(touches: NativeTouchEvent[]): TouchPoint[] {
  // identifier is typed as a string but is a number on some platforms.
  return touches.map((touch) => ({
    id: String(touch.identifier),
    x: touch.locationX,
    y: touch.locationY,
  }));
}

/**
 * One touch surface for a whole keyboard. Fingers are hit-tested against the layout
 * (nearest key, so gaps and edges count) and tracked by TouchTracker; the keys
 * themselves only draw. Rows are flex boxes in the same proportions as the hit test.
 */
export function KeySurface({
  rows,
  label,
  role,
  modes,
  onAction,
  compact = false,
}: KeySurfaceProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<ActiveKey[]>([]);
  const placed = useMemo(() => placeKeys(rows, width, SURFACE_PADDING.top), [rows, width]);
  const [tracker] = useState(
    () => new TouchTracker({ onAction, onActiveChange: setActive, onHaptic: playHaptic })
  );

  useEffect(() => {
    tracker.update(placed, { onAction, onActiveChange: setActive, onHaptic: playHaptic });
  }, [tracker, placed, onAction]);
  useEffect(() => () => tracker.dispose(), [tracker]);

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  function activate(def: KeyDef, actionName: string) {
    const action = accessibilityOutput(def, actionName);
    if (action) onAction(action, { keyId: def.id, held: NOTHING_HELD });
  }

  const shiftOn = modes.shift !== 'off';
  const latest = active.reduce<ActiveKey | null>(
    (newest, key) => (!newest || key.startedAt >= newest.startedAt ? key : newest),
    null
  );
  const latestPlaced = latest ? placed.find((item) => item.key.id === latest.keyId) : undefined;

  return (
    <View
      {...webSurface}
      role={role}
      aria-label={label}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderStart={(event: GestureResponderEvent) =>
        tracker.start(points(event.nativeEvent.changedTouches))
      }
      onResponderMove={(event: GestureResponderEvent) =>
        tracker.move(points(event.nativeEvent.touches))
      }
      onResponderEnd={(event: GestureResponderEvent) =>
        tracker.end(points(event.nativeEvent.changedTouches))
      }
      onResponderRelease={(event: GestureResponderEvent) =>
        tracker.release(points(event.nativeEvent.changedTouches))
      }
      onResponderTerminate={() => tracker.cancel()}
      style={[styles.surface, webSurfaceStyle, { backgroundColor: theme.keyboard }]}>
      <View pointerEvents={KEYS_POINTER_EVENTS}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.row, { height: row.height }]}>
            {row.inset > 0 ? <View style={{ flexGrow: row.inset, flexBasis: 0 }} /> : null}
            {row.keys.map((def) => {
              const pressed = active.find((key) => key.keyId === def.id);
              return (
                <KeyCell
                  key={def.id}
                  def={def}
                  label={labelFor(def, shiftOn)}
                  mode={def.tap?.type === 'modifier' ? modes[def.tap.modifier] : null}
                  state={pressed ? { ...pressed, pressed: true } : IDLE}
                  compact={compact}
                  onAccessibilityAction={activate}
                />
              );
            })}
            {row.inset > 0 ? <View style={{ flexGrow: row.inset, flexBasis: 0 }} /> : null}
          </View>
        ))}
      </View>
      {latest && latestPlaced ? (
        <KeyBubble
          def={latestPlaced.key}
          label={labelFor(latestPlaced.key, shiftOn)}
          rect={latestPlaced.rect}
          direction={latest.direction}
          surfaceWidth={width}
          theme={theme}
        />
      ) : null}
    </View>
  );
}

type KeyCellProps = {
  def: KeyDef;
  label: string;
  mode: ModifierMode | null;
  state: KeyVisualState;
  compact: boolean;
  onAccessibilityAction(def: KeyDef, actionName: string): void;
};

/** A key's slot in its row: the accessible element, padding around the visible face. */
function KeyCell({ def, label, mode, state, compact, onAccessibilityAction }: KeyCellProps) {
  const theme = useTheme();
  // On the web, assistive technology activates a key with a click that has no mouse
  // behind it (detail 0); real mouse clicks already went through the responder.
  const webClick: object =
    Platform.OS === 'web'
      ? {
          onClick: (event: { nativeEvent: { detail: number } }) => {
            if (event.nativeEvent.detail === 0) onAccessibilityAction(def, 'activate');
          },
        }
      : {};

  return (
    <View
      {...webClick}
      role={def.behavior === 'modifier' ? 'switch' : 'button'}
      aria-label={def.name}
      aria-checked={mode === null ? undefined : mode !== 'off'}
      aria-valuetext={mode === null ? undefined : mode}
      accessible
      focusable={false}
      accessibilityActions={accessibilityActions(def)}
      onAccessibilityAction={(event: AccessibilityActionEvent) =>
        onAccessibilityAction(def, event.nativeEvent.actionName)
      }
      style={[
        styles.cell,
        compact ? styles.cellCompact : styles.cellRegular,
        { flexGrow: def.units, flexBasis: 0 },
      ]}>
      <KeyCap def={def} label={label} mode={mode} state={state} theme={theme} compact={compact} />
    </View>
  );
}

const PAGE_ACTIONS: Record<Direction, string> = {
  up: 'page-up',
  down: 'page-down',
  left: 'home',
  right: 'end',
};

/**
 * Screen readers can't flick, so every secondary is also a named accessibility action
 * (VoiceOver's actions rotor, TalkBack's actions menu).
 */
function accessibilityActions(def: KeyDef) {
  if (def.behavior === 'arrows') {
    return [
      ...DIRECTIONS.map((direction) => ({
        name: direction,
        label: `${direction[0].toUpperCase()}${direction.slice(1)} arrow`,
      })),
      { name: 'home', label: 'Home' },
      { name: 'end', label: 'End' },
      { name: 'page-up', label: 'Page up' },
      { name: 'page-down', label: 'Page down' },
    ];
  }
  return [
    { name: 'activate' },
    ...DIRECTIONS.flatMap((direction) => {
      const secondary = def.flicks[direction];
      return secondary ? [{ name: direction, label: secondary.name }] : [];
    }),
  ];
}

function accessibilityOutput(def: KeyDef, actionName: string): KeyAction | null {
  if (def.behavior === 'arrows') {
    const arrow = DIRECTIONS.find((direction) => direction === actionName);
    if (arrow) return { type: 'key', key: ARROW_KEYS[arrow] };
    const page = DIRECTIONS.find((direction) => PAGE_ACTIONS[direction] === actionName);
    return page ? { type: 'key', key: PAGE_KEYS[page] } : null;
  }
  if (actionName === 'activate') return def.tap;
  const direction = DIRECTIONS.find((candidate) => candidate === actionName);
  return direction ? (def.flicks[direction]?.action ?? null) : null;
}

const styles = StyleSheet.create({
  surface: { paddingTop: SURFACE_PADDING.top, paddingBottom: SURFACE_PADDING.bottom },
  row: { flexDirection: 'row' },
  cell: { flexShrink: 1, minWidth: 0 },
  cellCompact: { paddingHorizontal: 2.5, paddingVertical: 3 },
  cellRegular: { paddingHorizontal: 3, paddingVertical: 4 },
});
