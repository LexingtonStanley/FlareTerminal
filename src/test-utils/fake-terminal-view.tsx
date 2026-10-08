import { useEffect, useImperativeHandle, useState } from 'react';
import { Text } from 'react-native';

import { sequenceForKey } from '@/features/terminal/keys';
import type { TerminalViewProps } from '@/features/terminal/terminal-view';

/**
 * Stands in for the xterm.js DOM component, which renders a WebView on native. Shows
 * everything written to it as text (label "Terminal output"), reports a fixed size,
 * and turns pressKey/paste into onInput the way xterm does (without bracketed paste).
 *
 *   jest.mock('@/features/terminal/terminal-view', () =>
 *     jest.requireActual('@/test-utils/fake-terminal-view')
 *   );
 */
export const FAKE_SIZE = { cols: 80, rows: 24 };

export default function FakeTerminalView({ ref, fontSize, onReady, onInput }: TerminalViewProps) {
  const [output, setOutput] = useState('');

  useImperativeHandle(ref, () => ({
    write: (data: string) => setOutput((current) => current + data),
    focus: () => {},
    pressKey: (key) => onInput(sequenceForKey(key)),
    paste: (text: string) => onInput(text),
  }));

  useEffect(() => {
    onReady(FAKE_SIZE);
    // Once, like the real view: it reports ready after mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Text aria-label="Terminal output" style={{ fontSize }}>
      {output}
    </Text>
  );
}
