import { lineText, type StyledLine } from './history';

/**
 * A session's history in blocks, for reading mode: paragraphs of what was said, rules, and
 * each tool an agent ran with its output under it, which folds away. Read off the lines'
 * text, so it knows the shapes agents print rather than any one agent's internals:
 * - Claude Code: `⏺ Bash(npm test)`, then the output under `  ⎿  `;
 * - Codex: `• Ran npm test`, then the output under `  └ `, and `• Edited src/app.ts (+3 -1)`.
 */

export type Block =
  | { kind: 'text'; lines: StyledLine[] }
  | {
      kind: 'tool';
      /** The tool call: `⏺ Bash(npm test)`. */
      header: StyledLine;
      /** Everything it printed, indented under the call. */
      body: StyledLine[];
    }
  /** A line drawn across the screen, such as the edges of an agent's input box. */
  | { kind: 'rule' };

/** A bullet at the start of a line: an agent starting a message or a tool call. */
const BULLET = /^\s{0,2}[⏺●•]\s+/;
/**
 * Claude Code's tool calls: `Bash(…)`, `Web Search(…)`, `Update Todos`, and MCP tools
 * (`github - create_issue (MCP)(…)`).
 */
const CLAUDE_TOOL = /^(?:[A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*\(|Update Todos\b|.*\(MCP\)\()/;
/** Codex's: `Ran npm test`, `Edited src/app.ts (+3 -1)`, `Explored`. */
const CODEX_TOOL =
  /^(?:Ran|Running|Edited|Added|Deleted|Updated|Read|Explored|Exploring|Searched|Called|Listed|Waited|Applied)\b/;
/** Box drawing (or dashes) across the screen and nothing else. */
const RULE = /^\s*[─━═╌┄-]{8,}\s*$/;
/** Longer paragraphs are split, so the list never lays out one huge item. */
const PARAGRAPH_LINES = 60;

export function isToolCall(text: string): boolean {
  if (!BULLET.test(text)) return false;
  const call = text.replace(BULLET, '');
  return CLAUDE_TOOL.test(call) || CODEX_TOOL.test(call);
}

const isIndented = (text: string) => /^\s/.test(text);
const isBlank = (text: string) => text.trim() === '';

export function toBlocks(lines: StyledLine[]): Block[] {
  const blocks: Block[] = [];
  const texts = lines.map(lineText);
  let paragraph: StyledLine[] = [];
  const endParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'text', lines: paragraph });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const text = texts[i];
    if (isBlank(text)) {
      endParagraph();
      continue;
    }
    if (RULE.test(text)) {
      endParagraph();
      if (blocks.at(-1)?.kind !== 'rule') blocks.push({ kind: 'rule' });
      continue;
    }
    if (!isToolCall(text)) {
      if (paragraph.length === PARAGRAPH_LINES) endParagraph();
      paragraph.push(lines[i]);
      continue;
    }
    // The output: indented lines, and blank lines between them.
    let end = i + 1;
    while (end < lines.length) {
      if (isIndented(texts[end]) && !isBlank(texts[end])) end++;
      else if (isBlank(texts[end]) && end + 1 < lines.length && isIndented(texts[end + 1])) end++;
      else break;
    }
    // A sentence with nothing under it is the agent talking: "• Added a test for it."
    if (end === i + 1 && /[.!?:]$/.test(text.trimEnd())) {
      paragraph.push(lines[i]);
      continue;
    }
    endParagraph();
    blocks.push({ kind: 'tool', header: lines[i], body: lines.slice(i + 1, end) });
    i = end - 1;
  }
  endParagraph();
  return blocks;
}

/** Folded, a tool block shows this many lines of its output. */
export const FOLDED_LINES = 2;

/** Whether a tool block has more output than it shows folded. */
export function folds(block: Block): boolean {
  return block.kind === 'tool' && block.body.length > FOLDED_LINES + 1;
}

/** What a tool's output says without its frame: the `⎿` or `└` and the indent under it. */
function bodyText(body: StyledLine[]): string[] {
  const texts = body.map((line) => lineText(line).replace(/^(\s*)[⎿└]\s?/, '$1  '));
  const indents = texts
    .filter((text) => !isBlank(text))
    .map((text) => /^\s*/.exec(text)![0].length);
  const indent = indents.length ? Math.min(...indents) : 0;
  return texts.map((text) => text.slice(indent).trimEnd());
}

/**
 * The history as Markdown: what was said as it is, without the agents' bullets; each tool
 * call in bold with its output in a code block; rules as rules.
 */
export function toMarkdown(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'rule') return '---';
      if (block.kind === 'text') {
        return block.lines.map((line) => lineText(line).replace(BULLET, '').trimEnd()).join('\n');
      }
      const call = lineText(block.header).replace(BULLET, '').trim();
      const output = bodyText(block.body)
        .join('\n')
        .replace(/^\n+|\n+$/g, '');
      // A fence longer than any run of backticks inside it.
      const longest = Math.max(2, ...(output.match(/`+/g) ?? []).map((run) => run.length));
      const fence = '`'.repeat(longest + 1);
      return output ? `**${call}**\n\n${fence}\n${output}\n${fence}` : `**${call}**`;
    })
    .join('\n\n');
}
