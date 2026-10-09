'use dom';

import '@xterm/xterm/css/xterm.css';
import './terminal-view.css';

import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from 'expo/dom';
import { useEffect, useEffectEvent, useRef, type DependencyList, type Ref } from 'react';

import type { TerminalTheme } from '@/constants/theme';

import { arrowsForTap } from './cursor-tap';
import { sequenceForKey, type SpecialKey } from './keys';
import type { TerminalSize } from './transport';

/**
 * The terminal screen, rendered by xterm.js. A DOM component: on the web it is a
 * plain React component; on Android and iOS Expo runs it inside a WebView, so every
 * prop must be JSON-serializable and function props become async calls back to
 * the app. Output goes in through the imperative handle (`write`), input comes out
 * through `onInput`. The view knows nothing about connections.
 *
 * It never asks for the phone's keyboard (the app has its own, and a text field for
 * the phone's): it keeps focus for the cursor and hardware keyboards, and a tap on the
 * line being edited moves the cursor there.
 */

export type TerminalViewHandle = {
  write(data: string): void;
  focus(): void;
  /** Sends a key-bar key, encoded for the terminal's current cursor mode. */
  pressKey(key: SpecialKey): void;
  /**
   * Sends text as a paste: bracketed when the app enabled bracketed paste, so a shell
   * or an agent's prompt box receives it as one block instead of typed keystrokes.
   */
  paste(text: string): void;
  /** Clears the screen and scrollback before another session's screen is drawn. */
  reset(): void;
};

export type TerminalViewProps = {
  ref?: Ref<TerminalViewHandle>;
  theme: TerminalTheme;
  fontSize: number;
  /** Called once the handle accepts writes, with the size the terminal fits into. */
  onReady: (size: TerminalSize) => void;
  /** Bytes to send to the host: typed text, pastes and key-bar keys. */
  onInput: (data: string) => void;
  onResize: (size: TerminalSize) => void;
  onTitleChange: (title: string) => void;
  onOpenLink: (url: string) => void;
  dom?: DOMProps;
};

/**
 * useDOMImperativeHandle with precise method types. Expo types every handle method as
 * `(...args: JSONValue[]) => void`; arguments are JSON-encoded either way.
 */
function useTypedDOMImperativeHandle<T>(
  ref: Ref<T> | undefined,
  init: () => T,
  deps: DependencyList
) {
  useDOMImperativeHandle(
    (ref ?? null) as Ref<DOMImperativeFactory>,
    init as unknown as () => DOMImperativeFactory,
    deps
  );
}

const FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", "Roboto Mono", "DejaVu Sans Mono", "Liberation Mono", monospace';

export default function TerminalView({
  ref,
  theme,
  fontSize,
  onReady,
  onInput,
  onResize,
  onTitleChange,
  onOpenLink,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Must come before the effect that calls onReady: on native, this registers the
  // handle with the app, and the app only writes once it has heard onReady.
  useTypedDOMImperativeHandle<TerminalViewHandle>(
    ref,
    () => ({
      write(data: string) {
        terminalRef.current?.write(data);
      },
      focus() {
        terminalRef.current?.focus();
      },
      pressKey(key: SpecialKey) {
        const terminal = terminalRef.current;
        if (!terminal) return;
        const applicationCursor = terminal.modes.applicationCursorKeysMode;
        // input() fires onData like typing does, so key-bar keys share one path.
        terminal.input(sequenceForKey(key, { applicationCursor }));
      },
      paste(text: string) {
        terminalRef.current?.paste(text);
      },
      reset() {
        terminalRef.current?.reset();
      },
    }),
    []
  );

  const ready = useEffectEvent((size: TerminalSize) => onReady(size));
  const input = useEffectEvent((data: string) => onInput(data));
  const resize = useEffectEvent((size: TerminalSize) => onResize(size));
  const titleChange = useEffectEvent((title: string) => onTitleChange(title));
  const openLink = useEffectEvent((url: string) => onOpenLink(url));
  const initialOptions = useEffectEvent(() => ({ theme, fontSize }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      ...initialOptions(),
      fontFamily: FONT_FAMILY,
      cursorBlink: true,
      scrollback: 5000,
      // Needed by the Unicode 11 addon, which measures emoji and CJK widths correctly.
      allowProposedApi: true,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = '11';
    terminal.loadAddon(new WebLinksAddon((_event, url) => openLink(url)));
    terminal.open(container);
    fit.fit();
    const textarea = terminal.textarea;
    textarea?.setAttribute('inputmode', 'none');
    textarea?.focus();
    const stopTaps = moveCursorOnTap(terminal);

    const subscriptions = [
      terminal.onData((data) => input(data)),
      terminal.onResize(({ cols, rows }) => resize({ cols, rows })),
      terminal.onTitleChange((title) => titleChange(title)),
    ];
    // Refit when the view changes size, e.g. rotation or the keyboard opening.
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(container);

    terminalRef.current = terminal;
    fitRef.current = fit;
    ready({ cols: terminal.cols, rows: terminal.rows });

    return () => {
      stopTaps();
      observer.disconnect();
      subscriptions.forEach((subscription) => subscription.dispose());
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = theme;
    terminal.options.fontSize = fontSize;
    fitRef.current?.fit();
  }, [theme, fontSize]);

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 6, background: theme.background }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// A tap, not a scroll or a selection: the pointer barely moved and came up soon.
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 400;

/**
 * Turns a tap on the line being edited into arrow keys (see cursor-tap.ts). Pointer
 * events rather than clicks, because touch scrolling can suppress the click. Programs
 * that read the mouse themselves (tmux with mouse on, vim with mouse=a), and full-screen
 * programs, get the tap as xterm.js reports it instead.
 */
function moveCursorOnTap(terminal: Terminal): () => void {
  const element = terminal.element;
  if (!element) return () => {};
  let down: { id: number; x: number; y: number; at: number } | null = null;

  const onDown = (event: PointerEvent) => {
    down = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp };
  };
  const onUp = (event: PointerEvent) => {
    const start = down;
    down = null;
    if (!start || start.id !== event.pointerId || event.button > 0) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > TAP_SLOP_PX || event.timeStamp - start.at > TAP_MAX_MS) return;
    const buffer = terminal.buffer.active;
    if (buffer.type !== 'normal' || terminal.modes.mouseTrackingMode !== 'none') return;
    if (terminal.hasSelection()) return;
    const screen = element.querySelector('.xterm-screen');
    if (!screen) return;
    const rect = screen.getBoundingClientRect();
    const col = Math.floor(((event.clientX - rect.left) / rect.width) * terminal.cols);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * terminal.rows);
    if (col < 0 || row < 0 || col >= terminal.cols || row >= terminal.rows) return;

    const presses = arrowsForTap(
      {
        cols: terminal.cols,
        length: buffer.length,
        cursorRow: buffer.baseY + buffer.cursorY,
        cursorCol: buffer.cursorX,
        isWrapped: (r) => buffer.getLine(r)?.isWrapped ?? false,
        contentEnd: (r) => {
          const line = buffer.getLine(r);
          for (let c = terminal.cols - 1; line && c >= 0; c--) {
            const cell = line.getCell(c);
            if (cell && cell.getChars().trim()) return c + cell.getWidth();
          }
          return 0;
        },
        cellWidth: (r, c) => buffer.getLine(r)?.getCell(c)?.getWidth() ?? 1,
      },
      buffer.viewportY + row,
      col
    );
    if (!presses) return;
    const applicationCursor = terminal.modes.applicationCursorKeysMode;
    const arrow = sequenceForKey(presses > 0 ? 'right' : 'left', { applicationCursor });
    terminal.input(arrow.repeat(Math.abs(presses)));
  };

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointerup', onUp);
  return () => {
    element.removeEventListener('pointerdown', onDown);
    element.removeEventListener('pointerup', onUp);
  };
}
