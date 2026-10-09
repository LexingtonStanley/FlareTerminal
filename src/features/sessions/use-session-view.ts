import { useEffect, useRef, useState, type RefObject } from 'react';

import {
  applyModifiers,
  NO_MODIFIERS,
  type Modifiers,
  type SpecialKey,
} from '@/features/terminal/keys';
import type { TerminalViewHandle, TerminalViewProps } from '@/features/terminal/terminal-view';
import type { TerminalSize } from '@/features/terminal/transport';

import type { ViewSink } from './session-manager';
import { useSessionManager } from './sessions-provider';

type ViewCallbacks = Pick<TerminalViewProps, 'onReady' | 'onInput' | 'onResize' | 'onTitleChange'>;

export type SessionView = {
  /** Spread onto the TerminalView whose ref was passed in. */
  viewCallbacks: ViewCallbacks;
  /** Sticky key-bar modifiers: armed by a tap, released by the next input. */
  modifiers: Modifiers;
  toggleModifier(name: keyof Modifiers): void;
  /** A special key from the key bar, encoded by the view for its cursor mode. */
  pressKey(key: SpecialKey): void;
  /** Characters typed outside the terminal (key bar symbols, Ctrl+letter from the composer). */
  type(text: string): void;
  /** The composer's text as a paste, then Enter. Empty text just presses Enter. */
  submit(text: string): void;
};

/**
 * Shows a session in a terminal view: attaches once the view has measured itself,
 * re-attaches when the screen switches to another session, and batches output into one
 * view write per frame (each write crosses into the WebView on native).
 */
export function useSessionView(
  viewRef: RefObject<TerminalViewHandle | null>,
  sessionId: string
): SessionView {
  const manager = useSessionManager();
  const sizeRef = useRef<TerminalSize | null>(null);
  const modifiersRef = useRef<Modifiers>(NO_MODIFIERS);
  const [ready, setReady] = useState(false);
  const [modifiers, setModifiersState] = useState<Modifiers>(NO_MODIFIERS);

  useEffect(() => {
    manager.setFocused(sessionId);
    const size = sizeRef.current;
    if (!ready || !size) return () => manager.setFocused(null);

    const pending: string[] = [];
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      if (!pending.length) return;
      viewRef.current?.write(pending.join(''));
      pending.length = 0;
    };
    const sink: ViewSink = {
      write(text) {
        pending.push(text);
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(flush);
      },
      reset() {
        pending.length = 0;
        viewRef.current?.reset();
      },
    };
    manager.attach(sessionId, sink, size);
    return () => {
      manager.detach(sessionId, sink);
      manager.setFocused(null);
    };
  }, [manager, sessionId, ready, viewRef]);

  function setModifiers(next: Modifiers) {
    modifiersRef.current = next;
    setModifiersState(next);
  }

  function input(data: string) {
    const active = modifiersRef.current;
    if (active.ctrl || active.alt) setModifiers(NO_MODIFIERS);
    manager.write(sessionId, applyModifiers(data, active));
  }

  return {
    viewCallbacks: {
      onReady(size) {
        sizeRef.current = size;
        setReady(true);
      },
      onInput: input,
      onResize(size) {
        sizeRef.current = size;
        manager.resize(sessionId, size);
      },
      // The session's own copy of the screen tracks titles.
      onTitleChange() {},
    },
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
  };
}
