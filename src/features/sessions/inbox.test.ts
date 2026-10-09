import {
  cleanLine,
  formatSince,
  inboxGroup,
  isMeaningful,
  lastMeaningfulLine,
  waitingFor,
  WORKING_WINDOW_MS,
} from './inbox';

describe('lastMeaningfulLine', () => {
  it('skips an empty input box, key hints and the tmux status line', () => {
    const screen = [
      '⏺ I updated the parser and all 41 tests pass.',
      '',
      '╭──────────────────────────────────────────╮',
      '│ >                                        │',
      '╰──────────────────────────────────────────╯',
      '  ? for shortcuts',
      '[main] 0:claude*                  "devbox" 14:05 09-Oct-26',
    ];

    expect(lastMeaningfulLine(screen)).toBe('I updated the parser and all 41 tests pass.');
  });

  it('keeps a question asked inside a box, without the box', () => {
    const screen = [
      '│ Do you want to make this edit to parser.ts? │',
      '│ ❯ 1. Yes                                     │',
      '│   2. No, and tell Claude what to do (esc)    │',
      '╰──────────────────────────────────────────────╯',
      '   Esc to cancel',
    ];

    expect(lastMeaningfulLine(screen)).toBe('2. No, and tell Claude what to do (esc)');
  });

  it('skips zellij bars', () => {
    expect(
      lastMeaningfulLine([
        'ada@devbox:~/app$ npm test',
        ' Ctrl + <g> LOCK  <p> PANE  <t> TAB  <n> RESIZE ',
        ' Zellij (main)  Tab #1 ',
      ])
    ).toBe('ada@devbox:~/app$ npm test');
  });

  it('keeps an agent’s spinner line, which says what it is doing', () => {
    expect(lastMeaningfulLine(['✻ Compiling… (12s · ↑ 1.2k tokens · esc to interrupt)', ''])).toBe(
      'Compiling… (12s · ↑ 1.2k tokens · esc to interrupt)'
    );
  });

  it('is null for a blank screen', () => {
    expect(lastMeaningfulLine(['', '   ', '──────'])).toBeNull();
  });
});

describe('isMeaningful and cleanLine', () => {
  it('needs three letters or digits', () => {
    expect(isMeaningful('> ')).toBe(false);
    expect(isMeaningful('$ ls')).toBe(false);
    expect(isMeaningful('$ git')).toBe(true);
  });

  it('collapses spinners, bullets and spacing', () => {
    expect(cleanLine('✻ Pondering…   (12s · esc to stop)')).toBe('Pondering… (12s · esc to stop)');
    expect(cleanLine('  ⎿  Read 3 files')).toBe('Read 3 files');
  });
});

describe('inboxGroup', () => {
  const now = 1_000_000;
  const connected = { status: { state: 'connected' } as const, reconnecting: false, prompt: null };

  it('puts an unseen alert first, whatever the screen does', () => {
    const attention = { title: 'Claude', body: 'Approve?', at: now - 1000 };
    expect(inboxGroup({ ...connected, attention }, { preview: null, changedAt: now }, now)).toBe(
      'needs-you'
    );
  });

  it('keeps a question on screen in Needs you after its alert was seen', () => {
    const prompt = { question: 'Proceed?', options: [], at: now - 60_000 };
    const session = { ...connected, attention: null, prompt };
    expect(inboxGroup(session, { preview: null, changedAt: now }, now)).toBe('needs-you');
    expect(waitingFor(session)).toEqual({ message: 'Proceed?', since: now - 60_000 });
  });

  it('is working while the screen changes, idle once it settles', () => {
    const session = { ...connected, attention: null };
    expect(inboxGroup(session, { preview: null, changedAt: now - 1000 }, now)).toBe('working');
    expect(inboxGroup(session, { preview: null, changedAt: now - WORKING_WINDOW_MS }, now)).toBe(
      'idle'
    );
    expect(inboxGroup(session, null, now)).toBe('idle');
  });

  it('counts a disconnected session as idle', () => {
    const session = {
      status: { state: 'closed', message: 'gone' } as const,
      reconnecting: false,
      attention: null,
      prompt: null,
    };
    expect(inboxGroup(session, { preview: null, changedAt: now }, now)).toBe('idle');
  });
});

describe('formatSince', () => {
  it.each([
    [0, 'now'],
    [45_000, '45s'],
    [12 * 60_000, '12m'],
    [3 * 3_600_000, '3h'],
    [3 * 86_400_000, '3d'],
  ])('formats %d ms as %s', (ms, text) => expect(formatSince(ms)).toBe(text));
});
