import { Terminal } from '@/features/sessions/headless-terminal';

import { applySgr, bufferLines, lineText, parseAnsi } from './history';

describe('parseAnsi', () => {
  it('reads lines of plain text', () => {
    expect(parseAnsi('one\ntwo\n\nfour\n')).toEqual([
      [{ text: 'one' }],
      [{ text: 'two' }],
      [],
      [{ text: 'four' }],
    ]);
  });

  it('reads colours: the palette, bright, 256 and RGB, with semicolons or colons', () => {
    const [line] = parseAnsi(
      '\x1b[31ma\x1b[91mb\x1b[38;5;208mc\x1b[38;2;255;0;16md\x1b[38:2::1:2:3me\x1b[42;39mf'
    );
    expect(line).toEqual([
      { text: 'a', fg: 1 },
      { text: 'b', fg: 9 },
      { text: 'c', fg: 208 },
      { text: 'd', fg: '#ff0010' },
      { text: 'e', fg: '#010203' },
      { text: 'f', bg: 2 },
    ]);
  });

  it('carries a style from one line to the next, as tmux prints it', () => {
    expect(parseAnsi('\x1b[1mone\ntwo\x1b[0m three')).toEqual([
      [{ text: 'one', bold: true }],
      [{ text: 'two', bold: true }, { text: ' three' }],
    ]);
  });

  it('merges text of the same style, and drops spaces at the end unless painted', () => {
    expect(parseAnsi('a\x1b[0mb   \n\x1b[41m+ add  \x1b[0m  ')).toEqual([
      [{ text: 'ab' }],
      [{ text: '+ add  ', bg: 1 }],
    ]);
  });

  it('drops other escape codes: links, titles, cursor moves, keyboard modes', () => {
    const text =
      '\x1b]8;;https://x.y\x1b\\link\x1b]8;;\x1b\\ \x1b]0;title\x07\x1b[2Kok\x1b[>4;2m\r';
    expect(parseAnsi(text)).toEqual([[{ text: 'link ok' }]]);
  });

  it('drops the empty rows at the end of the pane', () => {
    expect(parseAnsi('last\n\n\n   \n')).toEqual([[{ text: 'last' }]]);
  });
});

describe('applySgr', () => {
  it('sets and clears each style', () => {
    let style = applySgr({}, '1;2;3;4;7;9');
    expect(style).toEqual({
      bold: true,
      dim: true,
      italic: true,
      underline: true,
      inverse: true,
      strike: true,
    });
    style = applySgr(style, '22;23;24;27;29');
    expect(style).toEqual({});
    expect(applySgr({ fg: 1, bg: 2, bold: true }, '')).toEqual({});
    expect(applySgr({}, '4:3')).toEqual({ underline: true });
    expect(applySgr({ underline: true }, '4:0')).toEqual({});
  });

  it('ignores colours it cannot read, and underline colours', () => {
    expect(applySgr({ fg: 1 }, '38;5;300')).toEqual({ fg: 1 });
    expect(applySgr({}, '58;2;1;2;3;31')).toEqual({ fg: 1 });
  });
});

describe('bufferLines', () => {
  async function terminal(cols: number, text: string) {
    const term = new Terminal({ cols, rows: 4, scrollback: 100, allowProposedApi: true });
    await new Promise<void>((resolve) => term.write(text, resolve));
    return term;
  }

  it('joins the lines the terminal wrapped, keeping their colours', async () => {
    const term = await terminal(10, 'abcdefghij\x1b[32mklm\x1b[0m\r\nnext   ');
    const lines = bufferLines(term.buffer.active);
    expect(lines.slice(0, 2)).toEqual([
      [{ text: 'abcdefghij' }, { text: 'klm', fg: 2 }],
      [{ text: 'next' }],
    ]);
    term.dispose();
  });

  it('skips the cell a wide character left empty where the line wrapped', async () => {
    const term = await terminal(5, 'abcd漢字');
    expect(lineText(bufferLines(term.buffer.active)[0])).toBe('abcd漢字');
    term.dispose();
  });

  it('keeps blanks inside a line', async () => {
    const term = await terminal(20, 'a\x1b[5Cb');
    expect(lineText(bufferLines(term.buffer.active)[0])).toBe('a     b');
    term.dispose();
  });
});
