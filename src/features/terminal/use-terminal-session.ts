import { useEffect, useRef, useState, type RefObject } from 'react';

import { applyModifiers, NO_MODIFIERS, type Modifiers, type SpecialKey } from './keys';
import type { TerminalViewHandle, TerminalViewProps } from './terminal-view';
import type {
  SessionStatus,
  TerminalSize,
  TerminalTransport,
  TransportListener,
} from './transport';

export type OpenTransport = (listener: TransportListener) => TerminalTransport;

type ViewCallbacks = Pick<TerminalViewProps, 'onReady' | 'onInput' | 'onResize' | 'onTitleChange'>;

export type TerminalSession = {
  /** Spread onto the TerminalView whose ref was passed in. */
  viewCallbacks: ViewCallbacks;
  status: SessionStatus;
  /** Set by the host (ttyd's "command (host)") or by the shell with an OSC title sequence. */
  title: string | null;
  /** Sticky key-bar modifiers: armed by a tap, released by the next input. */
  modifiers: Modifiers;
  toggleModifier(name: keyof Modifiers): void;
  /** A special key from the key bar, encoded by the view for its cursor mode. */
  pressKey(key: SpecialKey): void;
  /** Characters typed outside the terminal (key bar symbols, Ctrl+letter from the composer). */
  type(text: string): void;
  /** The composer's text as a paste, then Enter. Empty text just presses Enter. */
  submit(text: string): void;
  reconnect(): void;
};

/**
 * Runs one terminal session. Connects once the view has measured itself (ttyd sizes
 * the process from the first message), batches output into one view write per frame
 * (each write crosses into the WebView on native), and applies sticky modifiers.
 */
export function useTerminalSession(
  viewRef: RefObject<TerminalViewHandle | null>,
  openTransport: OpenTransport
): TerminalSession {
  const transportRef = useRef<TerminalTransport | null>(null);
  const openRef = useRef(openTransport);
  const sizeRef = useRef<TerminalSize>({ cols: 80, rows: 24 });
  const viewReadyRef = useRef(false);
  const outputRef = useRef<string[]>([]);
  const flushScheduledRef = useRef(false);
  const modifiersRef = useRef<Modifiers>(NO_MODIFIERS);

  const [status, setStatus] = useState<SessionStatus>({ state: 'connecting' });
  const [title, setTitle] = useState<string | null>(null);
  const [modifiers, setModifiersState] = useState<Modifiers>(NO_MODIFIERS);

  useEffect(() => {
    openRef.current = openTransport;
  });

  useEffect(
    () => () => {
      transportRef.current?.close();
      transportRef.current = null;
    },
    []
  );

  function setModifiers(next: Modifiers) {
    modifiersRef.current = next;
    setModifiersState(next);
  }

  function flush() {
    flushScheduledRef.current = false;
    const view = viewRef.current;
    if (!viewReadyRef.current || !view || outputRef.current.length === 0) return;
    const data = outputRef.current.join('');
    outputRef.current = [];
    view.write(data);
  }

  function enqueue(text: string) {
    outputRef.current.push(text);
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    requestAnimationFrame(flush);
  }

  function connect() {
    transportRef.current?.close();
    // Events from a transport that has since been replaced are ignored.
    const isCurrent = () => transportRef.current === transport;
    const transport: TerminalTransport = openRef.current({
      onData(text) {
        if (isCurrent()) enqueue(text);
      },
      onTitle(next) {
        if (isCurrent()) setTitle(next);
      },
      onStatus(next) {
        if (isCurrent()) setStatus(next);
      },
    });
    transportRef.current = transport;
    transport.connect(sizeRef.current);
  }

  function input(data: string) {
    const active = modifiersRef.current;
    if (active.ctrl || active.alt) setModifiers(NO_MODIFIERS);
    transportRef.current?.write(applyModifiers(data, active));
  }

  return {
    viewCallbacks: {
      onReady(size) {
        sizeRef.current = size;
        viewReadyRef.current = true;
        // The WebView can reload (the OS reclaims its process); keep the session.
        if (!transportRef.current) connect();
        flush();
      },
      onInput: input,
      onResize(size) {
        sizeRef.current = size;
        transportRef.current?.resize(size);
      },
      onTitleChange: setTitle,
    },
    status,
    title,
    modifiers,
    toggleModifier(name) {
      setModifiers({ ...modifiersRef.current, [name]: !modifiersRef.current[name] });
    },
    pressKey(key) {
      viewRef.current?.pressKey(key);
    },
    type: input,
    submit(text) {
      setModifiers(NO_MODIFIERS);
      if (text) viewRef.current?.paste(text);
      viewRef.current?.pressKey('enter');
    },
    reconnect() {
      enqueue('\r\n');
      connect();
    },
  };
}
