import { HARNESSES, type AgentHarness } from '@/features/shortcuts/agent-command';

import {
  agentIn,
  promptTitle,
  quietHint,
  SLASH_COMMANDS,
  suggest,
  toSavedPrompt,
  type SavedPrompt,
  type Suggestion,
} from './prompts';

const SAVED: SavedPrompt[] = [
  { id: 'a', text: 'Run the tests and fix what fails' },
  { id: 'b', text: '/review-pr' },
  { id: 'c', text: 'Commit and push' },
];

/** What the chips say. */
const texts = (suggestions: Suggestion[]) =>
  suggestions.map((suggestion) => (suggestion.kind === 'save' ? 'Save' : suggestion.text));

describe('SLASH_COMMANDS', () => {
  it.each(Object.keys(HARNESSES) as AgentHarness[])(
    'has slash commands for %s, each once',
    (agent) => {
      const commands = SLASH_COMMANDS[agent].map(({ command }) => command);
      expect(commands.length).toBeGreaterThan(4);
      expect(new Set(commands).size).toBe(commands.length);
      for (const command of commands) expect(command).toMatch(/^\/[a-z-]+$/);
    }
  );

  it('describes each command in one line at phone width, even in a monospaced theme', () => {
    for (const { description } of Object.values(SLASH_COMMANDS).flat()) {
      expect(description.length).toBeLessThanOrEqual(40);
    }
  });

  it('offers each agent’s own way to free up context first', () => {
    expect(SLASH_COMMANDS.claude[0].command).toBe('/compact');
    expect(SLASH_COMMANDS.codex[0].command).toBe('/compact');
    expect(SLASH_COMMANDS.hermes[0].command).toBe('/compress');
    expect(SLASH_COMMANDS.pi[0].command).toBe('/compact');
  });
});

describe('suggest', () => {
  it('offers the agent’s commands, then the saved prompts, before anything is written', () => {
    const offered = texts(suggest('', 'claude', SAVED));

    expect(offered.slice(0, 3)).toEqual(['/compact', '/clear', '/context']);
    expect(offered.slice(-3)).toEqual(SAVED.map(({ text }) => text));
  });

  it('offers only saved prompts when the agent isn’t known', () => {
    expect(texts(suggest('', null, SAVED))).toEqual(SAVED.map(({ text }) => text));
    expect(suggest('', null, [])).toEqual([]);
  });

  it('narrows to the commands and saved prompts a slash begins', () => {
    expect(texts(suggest('/', 'codex', SAVED))).toEqual([
      ...SLASH_COMMANDS.codex.map(({ command }) => command),
      '/review-pr',
    ]);
    expect(texts(suggest('/re', 'claude', SAVED))).toEqual([
      '/resume',
      '/rewind',
      '/review',
      '/review-pr',
    ]);
    expect(texts(suggest('/CO', 'claude', SAVED))).toEqual(['/compact', '/context']);
  });

  it('offers nothing more for a command written out, or one with arguments', () => {
    expect(suggest('/compact', 'claude', [])).toEqual([]);
    // Arguments make it a prompt worth saving.
    expect(texts(suggest('/compact keep the test plan', 'claude', []))).toEqual(['Save']);
  });

  it('offers to save prose, and the saved prompts it begins', () => {
    expect(texts(suggest('Run', 'claude', SAVED))).toEqual([
      'Save',
      'Run the tests and fix what fails',
    ]);
    expect(texts(suggest('Deploy it', 'claude', SAVED))).toEqual(['Save']);
  });

  it('doesn’t offer to save what is saved already', () => {
    expect(suggest('Commit and push', 'claude', SAVED)).toEqual([]);
    expect(suggest('  Commit and push ', 'claude', SAVED)).toEqual([]);
  });
});

describe('quietHint', () => {
  it('describes a command as it is written', () => {
    expect(quietHint('/compact', 'claude', [])).toBe('Summarize to free up context');
    expect(quietHint('/compress', 'hermes', [])).toBe('Compress to free up context');
  });

  it('says when the draft is saved, when no command matches, and where prompts go', () => {
    expect(quietHint('Commit and push', 'claude', SAVED)).toBe('Saved in your prompts');
    expect(quietHint('/nope', 'claude', [])).toBe('No matching commands');
    expect(quietHint('', null, [])).toBe('Prompts you save show here');
  });
});

describe('agentIn', () => {
  it.each([
    ['claude', 'claude'],
    ['cd ~/app && claude --dangerously-skip-permissions', 'claude'],
    ['source .env; codex', 'codex'],
    ['hermes', 'hermes'],
    ['cd ~/pi-site && pi', 'pi'],
  ])('finds the agent in %j', (command, agent) => {
    expect(agentIn(command)).toBe(agent);
  });

  it.each([null, '', 'ssh pi', 'tmux new -A -s main', 'cd ~/pi && ls', 'htop', 'claudette'])(
    'finds none in %j',
    (command) => {
      expect(agentIn(command)).toBeNull();
    }
  );
});

describe('promptTitle', () => {
  it('shows a prompt’s first line, and marks the rest', () => {
    expect(promptTitle('Commit and push')).toBe('Commit and push');
    expect(promptTitle('Review the diff.\nThen list what’s risky.')).toBe('Review the diff. …');
  });
});

describe('toSavedPrompt', () => {
  it('keeps stored prompts and drops anything else', () => {
    expect(toSavedPrompt({ id: 'a', text: 'Commit' })).toEqual({ id: 'a', text: 'Commit' });
    expect(toSavedPrompt({ id: 'a', text: '  ' })).toBeNull();
    expect(toSavedPrompt({ id: 1, text: 'Commit' })).toBeNull();
    expect(toSavedPrompt('Commit')).toBeNull();
    expect(toSavedPrompt(null)).toBeNull();
  });
});
