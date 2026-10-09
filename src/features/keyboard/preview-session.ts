import { useRef, useState } from 'react';

import {
  applyModifiers,
  sequenceForKey,
  type FunctionKey,
  type SpecialKey,
} from '@/features/terminal/keys';

import { afterInput, MODIFIERS_OFF, toModifiers, type ModifierState } from './modifiers';
import type { KeyboardInputProps } from './use-key-actions';

const KEY_NAMES: Partial<Record<SpecialKey, string>> = {
  enter: '⏎',
  escape: 'esc',
  tab: 'tab',
  'shift-tab': '⇧tab',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  home: 'home',
  end: 'end',
  'page-up': 'pgup',
  'page-down': 'pgdn',
  backspace: '⌫',
  delete: 'del',
  insert: 'ins',
};

const FUNCTION_KEYS = Array.from({ length: 12 }, (_, index) => `f${index + 1}` as FunctionKey);

// Every special key's bytes, in both cursor modes, mapped back to a readable name.
const SEQUENCE_NAMES = new Map<string, string>();
for (const [key, name] of Object.entries(KEY_NAMES) as [SpecialKey, string][]) {
  SEQUENCE_NAMES.set(sequenceForKey(key), name);
  SEQUENCE_NAMES.set(sequenceForKey(key, { applicationCursor: true }), name);
}
for (const key of FUNCTION_KEYS) SEQUENCE_NAMES.set(sequenceForKey(key), key.toUpperCase());

/**
 * What the terminal would receive, readably: "↑" for an arrow, "^C" for a control
 * byte, "M-b" for Alt+b (ESC prefix), "␠" for a space, other text as typed.
 */
export function describeInput(data: string): string {
  const named = SEQUENCE_NAMES.get(data);
  if (named) return named;
  if (data.length > 1 && data.startsWith('\x1b')) return `M-${describeInput(data.slice(1))}`;
  return [...data]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (char === ' ') return '␠';
      if (code < 0x20) return `^${String.fromCharCode(code + 0x40)}`;
      if (code === 0x7f) return '⌫';
      return char;
    })
    .join('');
}

/** A line editor just smart enough to echo what the preview's keys type. */
export function echo(line: string, data: string): string {
  if (data === '\r') return '';
  if (data === '\x7f') return line.slice(0, -1);
  if (data === '\x17') return line.replace(/\S*\s*$/, '');
  if (/^[\x20-\x7e]+$/.test(data)) return line + data;
  return line;
}

/**
 * Stands in for useTerminalSession in the keyboard preview, and shows how the session
 * adopts ModifierState: apply the armed modifiers to the next input, then afterInput().
 */
export function usePreviewSession() {
  const [modifiers, setModifiers] = useState<ModifierState>(MODIFIERS_OFF);
  const modifiersRef = useRef(modifiers);
  const [sent, setSent] = useState<string[]>([]);
  const [line, setLine] = useState('');

  function changeModifiers(next: ModifierState) {
    modifiersRef.current = next;
    setModifiers(next);
  }

  function input(data: string) {
    const active = modifiersRef.current;
    changeModifiers(afterInput(active));
    const bytes = applyModifiers(data, toModifiers(active));
    setSent((current) => [...current.slice(-59), bytes]);
    setLine((current) => echo(current, bytes));
  }

  const keyboardProps: KeyboardInputProps = {
    modifiers,
    onModifiersChange: changeModifiers,
    onText: input,
    // The real view encodes for the cursor mode the app asked for; the preview has none.
    onKey: (key) => input(sequenceForKey(key)),
  };

  return {
    keyboardProps,
    sent,
    line,
    clear() {
      setSent([]);
      setLine('');
    },
  };
}
