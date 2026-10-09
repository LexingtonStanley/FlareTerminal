import { act, renderHook } from '@testing-library/react-native';

import { describeInput, echo, usePreviewSession } from './preview-session';

describe('describeInput', () => {
  it.each([
    ['\x1b[A', '↑'],
    ['\x1bOA', '↑'],
    ['\x1b[Z', '⇧tab'],
    ['\x1b', 'esc'],
    ['\r', '⏎'],
    ['\x7f', '⌫'],
    ['\x1b[15~', 'F5'],
    ['\x03', '^C'],
    ['\n', '^J'],
    ['\x1bb', 'M-b'],
    ['\x1b\x1b[D', 'M-←'],
    ['ls -la', 'ls␠-la'],
  ])('shows %j as %s', (data, expected) => {
    expect(describeInput(data)).toBe(expected);
  });
});

describe('echo', () => {
  it('edits a line like a shell would', () => {
    let line = '';
    for (const data of ['l', 's', ' ', '-', 'x', '\x7f', 'l', 'a']) line = echo(line, data);
    expect(line).toBe('ls -la');
    expect(echo('git commit -m', '\x17')).toBe('git commit ');
    expect(echo(line, '\x1b[A')).toBe(line);
    expect(echo(line, '\r')).toBe('');
  });
});

describe('usePreviewSession', () => {
  it('applies armed modifiers to the next input, then releases one-shot ones', async () => {
    const { result } = await renderHook(() => usePreviewSession());

    await act(() =>
      result.current.keyboardProps.onModifiersChange({ ctrl: 'once', alt: 'locked' })
    );
    await act(() => result.current.keyboardProps.onText('c'));
    await act(() => result.current.keyboardProps.onKey('left'));

    expect(result.current.sent).toEqual(['\x1b\x03', '\x1b\x1b[D']);
    expect(result.current.keyboardProps.modifiers).toEqual({ ctrl: 'off', alt: 'locked' });
  });
});
