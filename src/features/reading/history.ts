import type { IBuffer, IBufferCell, IBufferLine } from '@xterm/headless';

/**
 * A session's history as lines of styled text, for reading mode: what the agent wrote,
 * with the colours it wrote it in, and lines the terminal wrapped joined back together so
 * they rewrap to the phone's width.
 */

/** A palette entry (0 to 255) or a `#rrggbb` colour. */
export type Color = number | string;

export type Span = {
  text: string;
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strike?: boolean;
};

export type StyledLine = Span[];

type Style = Omit<Span, 'text'>;

/** Lines of `buffer` from `start` up to (not including) `end`, wrapped lines joined. */
export function bufferLines(buffer: IBuffer, start = 0, end = buffer.length): StyledLine[] {
  const lines: StyledLine[] = [];
  const cell = buffer.getNullCell();
  for (let y = start; y < end; y++) {
    const line = buffer.getLine(y);
    if (!line) continue;
    const spans = lineSpans(line, cell, buffer.getLine(y + 1)?.isWrapped ?? false);
    const previous = lines[lines.length - 1];
    if (line.isWrapped && previous) {
      for (const span of spans) {
        const last = previous[previous.length - 1];
        if (last && sameStyle(last, span)) last.text += span.text;
        else previous.push(span);
      }
    } else {
      lines.push(spans);
    }
  }
  // Joined lines are trimmed as a whole: a wrapped line's end is mid-line.
  return lines.map(trimEnd);
}

/**
 * One row's spans, read a cell at a time: a style is built only where it changes, since a
 * history has hundreds of thousands of cells. Unpainted blanks at the end are left out,
 * unless the line goes on (`wraps`).
 */
function lineSpans(line: IBufferLine, cell: IBufferCell, wraps: boolean): Span[] {
  let width = line.length;
  if (!wraps) {
    while (width > 0 && line.getCell(width - 1, cell) && isBlank(cell)) width--;
  } else if (line.getCell(width - 1, cell) && !cell.getChars()) {
    // A wide character that didn't fit at the end of the row leaves an empty cell there.
    width--;
  }
  const spans: Span[] = [];
  let key = '';
  let text = '';
  let style: Style = {};
  for (let x = 0; x < width; x++) {
    if (!line.getCell(x, cell)) continue;
    // The second half of a wide character.
    if (cell.getWidth() === 0) continue;
    const next = styleKey(cell);
    if (next !== key) {
      if (text) spans.push({ text, ...style });
      key = next;
      style = styleOf(cell);
      text = '';
    }
    text += cell.getChars() || ' ';
  }
  if (text) spans.push({ text, ...style });
  return spans;
}

function isBlank(cell: IBufferCell) {
  const chars = cell.getChars();
  return (chars === '' || chars === ' ') && cell.isBgDefault() && !cell.isInverse();
}

/** The cell's style as a string, cheap to compare with the cell before it. */
function styleKey(cell: IBufferCell): string {
  // Most cells are plain text: one call instead of ten.
  if (cell.isAttributeDefault()) return '';
  return (
    `${cell.getFgColorMode()}:${cell.getFgColor()}:${cell.getBgColorMode()}:${cell.getBgColor()}:` +
    `${cell.isBold()}${cell.isDim()}${cell.isItalic()}${cell.isUnderline()}` +
    `${cell.isInverse()}${cell.isStrikethrough()}`
  );
}

function styleOf(cell: IBufferCell): Style {
  const style: Style = {};
  if (cell.isFgRGB()) style.fg = hex(cell.getFgColor());
  else if (cell.isFgPalette()) style.fg = cell.getFgColor();
  if (cell.isBgRGB()) style.bg = hex(cell.getBgColor());
  else if (cell.isBgPalette()) style.bg = cell.getBgColor();
  if (cell.isBold()) style.bold = true;
  if (cell.isDim()) style.dim = true;
  if (cell.isItalic()) style.italic = true;
  if (cell.isUnderline()) style.underline = true;
  if (cell.isInverse()) style.inverse = true;
  if (cell.isStrikethrough()) style.strike = true;
  return style;
}

function hex(rgb: number) {
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

const STYLE_KEYS = ['fg', 'bg', 'bold', 'dim', 'italic', 'underline', 'inverse', 'strike'] as const;

export function sameStyle(a: Span, b: Span) {
  return STYLE_KEYS.every((key) => a[key] === b[key]);
}

/** Spaces at the end of a line show nothing, unless they are painted (a diff's background). */
function trimEnd(line: StyledLine): StyledLine {
  const spans = [...line];
  while (spans.length) {
    const last = spans[spans.length - 1];
    if (last.bg !== undefined || last.inverse) break;
    const text = last.text.replace(/\s+$/, '');
    if (text) {
      spans[spans.length - 1] = { ...last, text };
      break;
    }
    spans.pop();
  }
  return spans;
}

/** The text of a line, without its styles. */
export function lineText(line: StyledLine): string {
  return line.map(({ text }) => text).join('');
}

/**
 * An escape sequence: a CSI (SGR ends in `m`; the rest are dropped), an OSC (a link, a
 * title), a DCS or other string, or a two-character escape. Then the control characters
 * other than tab and newline.
 */
const ESCAPE =
  /\x1b\[([0-9;:?<=>]*)[ -/]*([@-~])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[PX^_][^\x1b]*(?:\x1b\\)?|\x1b[ -~]?|[\x00-\x08\x0b-\x1f\x7f]/g;

/**
 * Turns history printed by tmux or zellij (text with colour escape codes) into lines. They
 * print text and SGR codes only, a line per line (`capture-pane -J` and zellij join the
 * lines a narrow pane wrapped), so this reads the codes itself rather than playing the text
 * into a terminal, which is many times slower on a phone. A style carries from one line to
 * the next, as tmux expects. Blank lines at the end (the pane's empty rows) are dropped.
 */
export function parseAnsi(text: string): StyledLine[] {
  const lines: StyledLine[] = [];
  let line: Span[] = [];
  let style: Style = {};
  const add = (chunk: string) => {
    const parts = chunk.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push(line);
        line = [];
      }
      if (part) append(line, { text: part, ...style });
    });
  };

  let last = 0;
  ESCAPE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ESCAPE.exec(text))) {
    if (match.index > last) add(text.slice(last, match.index));
    last = ESCAPE.lastIndex;
    // SGR: `CSI … m`, but not a private one (`CSI > … m` sets keyboard modes).
    if (match[2] === 'm' && !/[?<=>]/.test(match[1])) style = applySgr(style, match[1]);
  }
  if (last < text.length) add(text.slice(last));
  if (line.length) lines.push(line);

  const trimmed = lines.map(trimEnd);
  while (trimmed.length && trimmed[trimmed.length - 1].length === 0) trimmed.pop();
  return trimmed;
}

/** Adds a span, merging it into the last one when they look the same. */
function append(spans: Span[], span: Span) {
  const last = spans[spans.length - 1];
  if (last && sameStyle(last, span)) last.text += span.text;
  else spans.push(span);
}

/** The style after an SGR sequence's parameters (`1;38;5;208`, `38:2::255:0:0`). */
export function applySgr(current: Style, parameters: string): Style {
  let style = { ...current };
  const params = parameters.split(';');
  for (let i = 0; i < params.length; i++) {
    const [head, ...sub] = params[i].split(':');
    const code = head === '' ? 0 : Number(head);
    if (code === 38 || code === 48 || code === 58) {
      let color: Color | undefined;
      if (sub.length) {
        color = extendedColor(sub.map(Number), true);
      } else {
        const rest = params.slice(i + 1).map(Number);
        color = extendedColor(rest, false);
        i += rest[0] === 5 ? 2 : rest[0] === 2 ? 4 : 0;
      }
      // A colour it can't read leaves the colour as it was, as a terminal does.
      if (color === undefined) continue;
      if (code === 38) style.fg = color;
      else if (code === 48) style.bg = color;
      continue;
    }
    switch (code) {
      case 0:
        style = {};
        break;
      case 1:
        style.bold = true;
        break;
      case 2:
        style.dim = true;
        break;
      case 3:
        style.italic = true;
        break;
      case 4:
        // `4:0` is no underline; `4:3` a curly one.
        if (sub[0] === '0') delete style.underline;
        else style.underline = true;
        break;
      case 7:
        style.inverse = true;
        break;
      case 9:
        style.strike = true;
        break;
      case 21:
        style.underline = true;
        break;
      case 22:
        delete style.bold;
        delete style.dim;
        break;
      case 23:
        delete style.italic;
        break;
      case 24:
        delete style.underline;
        break;
      case 27:
        delete style.inverse;
        break;
      case 29:
        delete style.strike;
        break;
      case 39:
        delete style.fg;
        break;
      case 49:
        delete style.bg;
        break;
      default:
        if (code >= 30 && code <= 37) style.fg = code - 30;
        else if (code >= 40 && code <= 47) style.bg = code - 40;
        else if (code >= 90 && code <= 97) style.fg = code - 90 + 8;
        else if (code >= 100 && code <= 107) style.bg = code - 100 + 8;
    }
  }
  return style;
}

/**
 * `5;n` (a palette entry) or `2;r;g;b`. With colons, `2` may be followed by a colour space
 * id before r, g and b (`2::r:g:b`), so the colour is the last three numbers.
 */
function extendedColor([mode, ...rest]: number[], colons: boolean): Color | undefined {
  if (mode === 5) return valid(rest[0], 255) ? rest[0] : undefined;
  if (mode !== 2) return undefined;
  const rgb = colons ? rest.slice(-3) : rest.slice(0, 3);
  if (rgb.length < 3 || !rgb.every((value) => valid(value, 255))) return undefined;
  return `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function valid(value: number | undefined, max: number): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= max;
}
