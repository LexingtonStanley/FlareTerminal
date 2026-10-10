import { useEffect, useImperativeHandle, useState } from 'react';
import { Text } from 'react-native';

import { sequenceForKey } from '@/features/terminal/keys';
import type { TerminalViewProps } from '@/features/terminal/terminal-view';

/**
 * Stands in for the xterm.js DOM component, which renders a WebView on native. Shows
 * everything written to it as text (label "Terminal output"), reports a fixed size,
 * turns pressKey/paste into onInput the way xterm does (without bracketed paste), and
 * reports a press on it as a tap. Each web link in the output is also a link (named by its
 * URL) that reports a tap through onOpenLink, as xterm's link addon does. Two buttons stand
 * for swipes: "Swipe back" (one that scrolled back into the history) and "Swipe on a
 * full-screen program" (one that couldn't scroll). After scrollUp, "Lines scrolled up" says
 * how far.
 *
 *   jest.mock('@/features/terminal/terminal-view', () =>
 *     jest.requireActual('@/test-utils/fake-terminal-view')
 *   );
 */
export const FAKE_SIZE = { cols: 80, rows: 24 };

export default function FakeTerminalView({
  ref,
  fontSize,
  onReady,
  onInput,
  onTap,
  onOpenLink,
  onScrollBack,
  onScrollUnavailable,
}: TerminalViewProps) {
  const [output, setOutput] = useState('');
  const [scrolledUp, setScrolledUp] = useState<number | null>(null);
  const links = [...new Set(output.match(/https?:\/\/[^\s]+/g) ?? [])];

  useImperativeHandle(ref, () => ({
    write: (data: string) => setOutput((current) => current + data),
    focus: () => {},
    pressKey: (key) => onInput(sequenceForKey(key)),
    paste: (text: string) => onInput(text),
    reset: () => setOutput(''),
    scrollUp: (lines: number) => setScrolledUp(lines),
  }));

  useEffect(() => {
    onReady(FAKE_SIZE);
    // Once, like the real view: it reports ready after mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Text aria-label="Terminal output" style={{ fontSize }} onPress={onTap}>
        {output}
      </Text>
      {links.map((url) => (
        <Text key={url} role="link" aria-label={url} onPress={() => onOpenLink(url)} />
      ))}
      {scrolledUp !== null ? <Text aria-label="Lines scrolled up">{scrolledUp}</Text> : null}
      <Text role="button" aria-label="Swipe back" onPress={() => onScrollBack?.()} />
      <Text
        role="button"
        aria-label="Swipe on a full-screen program"
        onPress={() => onScrollUnavailable?.()}
      />
    </>
  );
}
