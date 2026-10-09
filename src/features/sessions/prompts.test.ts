import { detectPrompt, samePrompt } from './prompts';

const screen = (text: string) => text.split('\n');

describe('detectPrompt', () => {
  it('reads Claude Code’s permission dialog', () => {
    const prompt = detectPrompt(
      screen(`
⏺ I'll run the tests.

╭──────────────────────────────────────────────────────────────╮
│ Bash command                                                 │
│                                                              │
│   npm test                                                   │
│   Run the test suite                                         │
│                                                              │
│ Do you want to proceed?                                      │
│ ❯ 1. Yes                                                     │
│   2. Yes, and don't ask again for npm test commands in ~/app │
│   3. No, and tell Claude what to do differently (esc)        │
╰──────────────────────────────────────────────────────────────╯
[main] 0:claude*                            "devbox" 14:05 09-Oct-26`)
    );

    expect(prompt).toEqual({
      question: 'Do you want to proceed?',
      options: [
        { label: 'Yes', input: '1' },
        { label: "Yes, and don't ask again for npm test commands in ~/app", input: '2' },
        { label: 'No, and tell Claude what to do differently (esc)', input: '3' },
      ],
    });
  });

  it('reads Codex’s approval, with its letter shortcuts', () => {
    const prompt = detectPrompt(
      screen(`
Would you like to run the following command?

  $ npm test -- --watch=false

› 1. Yes, proceed (y)
  2. Yes, and don't ask again for this command (a)
  3. No, and tell Codex what to do differently (esc)

  Press enter to confirm or esc to cancel`)
    );

    expect(prompt?.question).toBe('Would you like to run the following command?');
    expect(prompt?.options.map(({ input }) => input)).toEqual(['y', 'a', '3']);
    expect(prompt?.options[0].label).toBe('Yes, proceed');
  });

  it('reads Gemini CLI’s confirmation', () => {
    const prompt = detectPrompt(
      screen(`
╭───────────────────────────────────────╮
│ ?  Shell npm test                      │
│                                        │
│ Allow execution of: 'npm'?             │
│                                        │
│ ● 1. Yes, allow once                   │
│   2. Yes, allow always ...             │
│   3. No, suggest changes (esc)         │
╰───────────────────────────────────────╯`)
    );

    expect(prompt?.question).toBe("Allow execution of: 'npm'?");
    expect(prompt?.options).toHaveLength(3);
  });

  it('reads Aider’s lettered questions', () => {
    expect(detectPrompt(["Run shell command? (Y)es/(N)o/(D)on't ask again [Yes]: "])).toEqual({
      question: 'Run shell command?',
      options: [
        { label: 'Yes', input: 'y\r' },
        { label: 'No', input: 'n\r' },
        { label: "Don't ask again", input: 'd\r' },
      ],
    });
  });

  it.each([
    ['Do you want to continue? [Y/n] ', 'Do you want to continue?'],
    ['Overwrite config.json? (y/N)', 'Overwrite config.json?'],
    ['Proceed (y/n)? ', 'Proceed'],
  ])('reads a shell prompt: %s', (line, question) => {
    expect(detectPrompt(['$ apt upgrade', '...', line])).toEqual({
      question,
      options: [
        { label: 'Yes', input: 'y\r' },
        { label: 'No', input: 'n\r' },
      ],
    });
  });

  it('ignores a numbered list in an agent’s answer', () => {
    expect(
      detectPrompt(
        screen(`
Which approach do you prefer?
1. Keep the cache
2. Drop it
╭────────╮
│ >      │
╰────────╯`)
      )
    ).toBeNull();
  });

  it('ignores a prompt that was answered or scrolled up', () => {
    expect(
      detectPrompt(['Do you want to continue? [Y/n] y', 'Reading package lists...'])
    ).toBeNull();
    const old = ['Do you want to proceed?', '❯ 1. Yes', '  2. No'];
    expect(detectPrompt([...old, ...Array.from({ length: 20 }, (_, i) => `line ${i}`)])).toBeNull();
    expect(detectPrompt(['', '  '])).toBeNull();
  });

  it('compares prompts by question and options', () => {
    const prompt = detectPrompt(['Proceed? [y/N]'])!;
    expect(samePrompt(prompt, detectPrompt(['$ x', 'Proceed? [y/N]'])!)).toBe(true);
    expect(samePrompt(prompt, detectPrompt(['Delete? [y/N]'])!)).toBe(false);
  });
});
