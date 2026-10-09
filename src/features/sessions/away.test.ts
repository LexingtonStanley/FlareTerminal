import { findDeparture, newFrom, screenContent } from './away';

/** Claude Code's live area under its output: the spinner, the input box, its hints. */
const LIVE = [
  '✻ Thinking… (esc to interrupt)',
  '╭──────────────────────────────╮',
  '│ >                            │',
  '╰──────────────────────────────╯',
  '  ? for shortcuts',
];

const EARLIER = ['$ claude', '> fix the failing test', '', "⏺ I'll run the tests first."];

describe('findDeparture', () => {
  it('finds the end of what was on screen, so what follows is new', () => {
    const history = [...EARLIER, '⏺ Bash(npm test)', '  ⎿  PASS src/a.test.ts', '⏺ Done.'];

    expect(findDeparture(history, EARLIER)).toBe(4);
  });

  it('skips the live area at the bottom of the screen, which never reaches the history', () => {
    const screen = [...EARLIER, ...LIVE, '[Janus] 0:claude*        "devbox" 14:05 09-Oct-26'];
    const history = [...EARLIER, '', '⏺ Bash(npm test)', '  ⎿  PASS src/a.test.ts', ...LIVE];

    expect(findDeparture(history, screen)).toBe(4);
  });

  it('matches lines the screen wrapped and the history keeps whole', () => {
    const long = `⏺ ${'The test in c.test.ts expects the old name, '.repeat(3)}so I renamed it.`;
    const screen = ['> fix it', long.slice(0, 60), long.slice(60, 120), long.slice(120)];
    const history = ['$ claude', '> fix it', long, '⏺ Bash(npm test)'];

    expect(findDeparture(history, screen)).toBe(3);
  });

  it('ignores the frame zellij draws round a pane, title and all', () => {
    const screen = [
      '┌ claude ~/agents/janus ───────────────┐',
      ...EARLIER.map((line) => `│${line.padEnd(38)}│`),
      '└──────────────────────────────────────┘',
    ];
    const history = [...EARLIER, '⏺ Bash(npm test)'];

    expect(findDeparture(history, screen)).toBe(4);
  });

  it('takes the latest place the screen appears', () => {
    const screen = ['⏺ Bash(npm test)', '  ⎿  PASS src/a.test.ts'];
    const history = [...screen, '⏺ Edit(src/a.ts)', ...screen, '⏺ All green.'];

    expect(findDeparture(history, screen)).toBe(5);
  });

  it('gives up when the screen isn’t in the history, or says too little to tell', () => {
    expect(findDeparture(['other output', 'entirely'], EARLIER)).toBeNull();
    expect(findDeparture(['$ ls', 'a b'], ['$ ls'])).toBeNull();
    expect(findDeparture(['anything'], [])).toBeNull();
  });
});

describe('newFrom', () => {
  it('starts at the top of the tool call or paragraph the new lines continue', () => {
    const screen = [...EARLIER, '⏺ Bash(npm test)', '  ⎿  Running…'];
    const history = [...EARLIER, '', '⏺ Bash(npm test)', '  ⎿  PASS src/a.test.ts', '⏺ Done.'];

    expect(findDeparture(history, screen)).toBe(6);
    expect(newFrom(history, screen)).toBe(5);
  });

  it('says when nothing follows', () => {
    expect(newFrom(EARLIER, EARLIER)).toBe(4);
    expect(newFrom(['other output'], EARLIER)).toBeNull();
  });
});

describe('screenContent', () => {
  it('ignores status bars, key hints and decoration, so a clock isn’t news', () => {
    const at = (time: string) => [...EARLIER, '  ? for shortcuts', `[Janus] 0:claude* ${time}`];

    expect(screenContent(at('14:05'))).toBe(screenContent(at('14:06')));
    // Nor an agent's working line, whose timer ticks.
    expect(screenContent([...EARLIER, '✻ Pondering… (12s · esc to interrupt)'])).toBe(
      screenContent([...EARLIER, '✻ Pondering… (75s · esc to interrupt)'])
    );
    expect(screenContent([...EARLIER, '⏺ Done.'])).not.toBe(screenContent(EARLIER));
  });
});
