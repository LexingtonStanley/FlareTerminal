/**
 * Tap to move the cursor: a tap on the line being edited (a shell command, an agent's
 * prompt) becomes the arrow-key presses that move the cursor there, as a person would
 * type them. Only along the cursor's own line and its soft-wrapped continuation rows:
 * Up and Down mean history in a shell, so moving between lines can't be faked safely.
 */

export type TapBuffer = {
  cols: number;
  /** Rows in the buffer, scrollback included. */
  length: number;
  /** The cursor, as a buffer row (not a viewport row) and a column. */
  cursorRow: number;
  cursorCol: number;
  /** True when the row continues the row above it (a soft wrap). */
  isWrapped(row: number): boolean;
  /** The column just past the row's last non-blank character. */
  contentEnd(row: number): number;
  /** 1, 2 for a wide character (emoji, CJK), or 0 for the cell a wide character spills into. */
  cellWidth(row: number, col: number): number;
};

/**
 * Arrow presses that move the cursor to the tapped cell: positive for Right, negative for
 * Left, 0 when the tap isn't on the cursor's line. A tap past the end of the text moves to
 * its end.
 */
export function arrowsForTap(buffer: TapBuffer, row: number, col: number): number {
  const { cols } = buffer;
  let first = buffer.cursorRow;
  while (first > 0 && buffer.isWrapped(first)) first--;
  let last = buffer.cursorRow;
  while (last + 1 < buffer.length && buffer.isWrapped(last + 1)) last++;
  if (row < first || row > last) return 0;

  const offset = (r: number, c: number) => (r - first) * cols + c;
  const rowOf = (at: number) => first + Math.floor(at / cols);
  const from = offset(buffer.cursorRow, buffer.cursorCol);
  const end = Math.max(offset(last, buffer.contentEnd(last)), from);
  let target = Math.min(offset(row, col), end);
  // The right half of a wide character belongs to the character.
  while (target > 0 && buffer.cellWidth(rowOf(target), target % cols) === 0) target--;

  // Count characters, not cells: one press crosses a wide character's two cells.
  const [start, stop] = target < from ? [target, from] : [from, target];
  let presses = 0;
  for (let at = start; at < stop; at++) {
    if (buffer.cellWidth(rowOf(at), at % cols) !== 0) presses++;
  }
  return target < from ? -presses : presses;
}
