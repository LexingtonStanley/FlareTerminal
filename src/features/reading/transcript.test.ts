import { parseAnsi } from './history';
import { folds, isToolCall, toBlocks, toMarkdown, type Block } from './transcript';

const blocksOf = (text: string) => toBlocks(parseAnsi(text));

/** A block as plain text, to compare shapes. */
function shape(block: Block) {
  const text = (line: { text: string }[]) => line.map((span) => span.text).join('');
  if (block.kind === 'rule') return { rule: true };
  if (block.kind === 'text') return { text: block.lines.map(text) };
  return { tool: text(block.header), body: block.body.map(text) };
}

describe('isToolCall', () => {
  it.each([
    '⏺ Bash(npm test)',
    '⏺ Update(src/app.ts)',
    '⏺ Web Search("expo sdk 57")',
    '⏺ Update Todos',
    '⏺ github - create_issue (MCP)(title: "x")',
    '⏺ Read 3 files (ctrl+o to expand)',
    '• Ran npm test',
    '• Edited src/app.ts (+3 -1)',
    '• Explored',
  ])('%s is a tool call', (line) => {
    expect(isToolCall(line)).toBe(true);
  });

  it.each([
    "⏺ I'll fix the failing test first.",
    '⏺ Done',
    "• I'm going to run the tests",
    'Bash(npm test)',
    '$ npm test',
  ])('%s is not', (line) => {
    expect(isToolCall(line)).toBe(false);
  });
});

describe('toBlocks', () => {
  it('reads Claude Code: paragraphs, and tool calls with their output', () => {
    const history = [
      '> fix the tests',
      '',
      "⏺ I'll run them first.",
      '',
      '⏺ Bash(npm test)',
      '  ⎿  PASS src/a.test.ts',
      '     PASS src/b.test.ts',
      '',
      '     Tests: 2 passed',
      '',
      '⏺ All green.',
      '────────────────────',
      '> ',
      '────────────────────',
    ].join('\n');

    expect(blocksOf(history).map(shape)).toEqual([
      { text: ['> fix the tests'] },
      { text: ["⏺ I'll run them first."] },
      {
        tool: '⏺ Bash(npm test)',
        body: ['  ⎿  PASS src/a.test.ts', '     PASS src/b.test.ts', '', '     Tests: 2 passed'],
      },
      { text: ['⏺ All green.'] },
      { rule: true },
      { text: ['>'] },
      { rule: true },
    ]);
  });

  it('reads Codex: a run, an edit with its diff, and a sentence that only looks like one', () => {
    const history = [
      '• Ran npm test',
      '  └ ok 12 tests',
      '• Edited src/app.ts (+1 -1)',
      '    1 -const a = 1;',
      '    1 +const a = 2;',
      '• Added a test for it.',
    ].join('\n');

    expect(blocksOf(history).map(shape)).toEqual([
      { tool: '• Ran npm test', body: ['  └ ok 12 tests'] },
      {
        tool: '• Edited src/app.ts (+1 -1)',
        body: ['    1 -const a = 1;', '    1 +const a = 2;'],
      },
      { text: ['• Added a test for it.'] },
    ]);
  });

  it('splits a long paragraph, so no item is huge', () => {
    const lines = Array.from({ length: 130 }, (_, i) => `line ${i}`).join('\n');
    expect(
      blocksOf(lines).map((block) => (block.kind === 'text' ? block.lines.length : 0))
    ).toEqual([60, 60, 10]);
  });
});

test('folds: a tool with more than three lines of output', () => {
  const [short, long] = blocksOf(
    [
      '⏺ Bash(a)',
      '  ⎿  1',
      '     2',
      '     3',
      '⏺ Bash(b)',
      '  ⎿  1',
      '     2',
      '     3',
      '     4',
    ].join('\n')
  );
  expect(folds(short)).toBe(false);
  expect(folds(long)).toBe(true);
});

describe('toMarkdown', () => {
  it('writes what was said, and each tool call with its output in a code block', () => {
    const history = [
      "⏺ I'll run them.",
      '',
      '⏺ Bash(npm test)',
      '  ⎿  PASS src/a.test.ts',
      '       nested',
      '──────────',
      '• Ran ls',
    ].join('\n');

    expect(toMarkdown(blocksOf(history))).toBe(
      [
        "I'll run them.",
        '',
        '**Bash(npm test)**',
        '',
        '```',
        'PASS src/a.test.ts',
        '  nested',
        '```',
        '',
        '---',
        '',
        '**Ran ls**',
      ].join('\n')
    );
  });

  it('fences output that has backticks in it with more of them', () => {
    const markdown = toMarkdown(blocksOf('⏺ Bash(cat README.md)\n  ⎿  ```js\n     x\n     ```'));
    expect(markdown).toBe('**Bash(cat README.md)**\n\n````\n```js\nx\n```\n````');
  });
});
