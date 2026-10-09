import { arrowsForTap, type TapBuffer } from './cursor-tap';

/**
 * A buffer from rows of text, `cols` wide. A row starting with "»" continues the row above
 * (a soft wrap). "＊" stands for a wide character: it takes two cells.
 */
function buffer(cols: number, rows: string[], cursor: [row: number, col: number]): TapBuffer {
  const cells = rows.map((text) =>
    [...text.replace(/^»/, '')].flatMap((char) => (char === '＊' ? [2, 0] : [1]))
  );
  return {
    cols,
    length: rows.length,
    cursorRow: cursor[0],
    cursorCol: cursor[1],
    isWrapped: (row) => rows[row]?.startsWith('»') ?? false,
    contentEnd: (row) => rows[row].replace(/^»/, '').trimEnd().replace(/＊/g, '..').length,
    cellWidth: (row, col) => cells[row]?.[col] ?? 1,
  };
}

describe('arrowsForTap', () => {
  const prompt = buffer(40, ['$ git commit -m "fix"'], [0, 21]);

  it('moves left or right along the line being edited', () => {
    expect(arrowsForTap(prompt, 0, 6)).toBe(-15);
    expect(arrowsForTap(buffer(40, ['$ ls -la'], [0, 2]), 0, 5)).toBe(3);
  });

  it('stops at the end of the text', () => {
    expect(arrowsForTap(buffer(40, ['$ ls -la'], [0, 2]), 0, 30)).toBe(6);
    expect(arrowsForTap(prompt, 0, 39)).toBe(0);
  });

  it('ignores taps on other lines', () => {
    const screen = buffer(40, ['old output', '$ make test'], [1, 11]);
    expect(arrowsForTap(screen, 0, 3)).toBe(0);
  });

  it('follows the line across soft-wrapped rows', () => {
    const wrapped = buffer(10, ['older', '$ echo abc', '»defghij'], [2, 7]);
    // Row 1, column 7 ("a") is 10 cells back from row 2, column 7.
    expect(arrowsForTap(wrapped, 1, 7)).toBe(-10);
    expect(arrowsForTap(wrapped, 0, 1)).toBe(0);
  });

  it('counts a wide character as one press, whichever half is tapped', () => {
    const emoji = buffer(40, ['$ echo ＊ok'], [0, 11]);
    // Cells: "$ echo " is 0-6, the wide character 7-8, "ok" 9-10.
    expect(arrowsForTap(emoji, 0, 7)).toBe(-3);
    expect(arrowsForTap(emoji, 0, 8)).toBe(-3);
    expect(arrowsForTap(emoji, 0, 9)).toBe(-2);
  });
});
