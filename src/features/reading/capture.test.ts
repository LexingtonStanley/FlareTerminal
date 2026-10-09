import { agentCommand, type AgentSession } from '@/features/shortcuts/agent-command';

import { historySourceOfCommand, parseReading, readingScript, sameSource } from './capture';

describe('readingScript', () => {
  it('lists the sessions only, when there is nothing to read yet', () => {
    const script = readingScript(null);
    expect(script).toContain("tmux list-sessions -F '#{session_name}'");
    expect(script).toContain('zellij list-sessions --short --no-formatting');
    expect(script).not.toContain('capture-pane');
    expect(script.trimEnd().endsWith('exit 0')).toBe(true);
  });

  it('reads a tmux session by its exact name, quoted for the shell', () => {
    const script = readingScript({ kind: 'tmux', session: 'my work' });
    expect(script).toContain("tmux capture-pane -p -J -e -S - -E - -t '=my work:' </dev/null");
  });

  it('reads zellij with colours, and falls back to the older way that writes a file', () => {
    const script = readingScript({ kind: 'zellij', session: 'Janus' });
    expect(script).toContain('zellij --session Janus action dump-screen --full --ansi </dev/null');
    expect(script).toContain('|| zellij --session Janus action dump-screen --full "$f"');
  });

  it('never lets a command read the rest of the script as its input', () => {
    const script = readingScript({ kind: 'tmux', session: 'Janus' });
    for (const line of script.split('\n').filter((text) => /\b(tmux|zellij) /.test(text))) {
      expect(line).toContain('</dev/null');
    }
  });
});

describe('parseReading', () => {
  it('reads the sessions and the history, after anything a login script printed', () => {
    const output = [
      'Welcome to the devbox',
      'flare-sessions',
      'tmux Janus',
      'tmux my work',
      'zellij Janus',
      'flare-history',
      '\x1b[32mline 1\x1b[0m',
      'tmux not a session',
      '',
    ].join('\n');

    expect(parseReading(output)).toEqual({
      sessions: [
        { kind: 'tmux', session: 'Janus' },
        { kind: 'tmux', session: 'my work' },
        { kind: 'zellij', session: 'Janus' },
      ],
      history: '\x1b[32mline 1\x1b[0m\ntmux not a session\n',
    });
  });

  it('has no history when the session could not be read', () => {
    expect(parseReading('flare-sessions\ntmux main\n')).toEqual({
      sessions: [{ kind: 'tmux', session: 'main' }],
      history: null,
    });
  });

  it('has a history with no sessions listed', () => {
    expect(parseReading('flare-sessions\nflare-history\nhello\n')).toEqual({
      sessions: [],
      history: 'hello\n',
    });
  });

  it('reads nothing from a host that never ran the script', () => {
    expect(parseReading('sh: not found\n')).toEqual({ sessions: [], history: null });
  });
});

describe('historySourceOfCommand', () => {
  it.each([
    ['tmux new -A -s main', { kind: 'tmux', session: 'main' }],
    ["cd ~/app && tmux new -A -s 'my work'", { kind: 'tmux', session: 'my work' }],
    ['tmux new-session -As dev', { kind: 'tmux', session: 'dev' }],
    ['tmux attach -t work:1.0', { kind: 'tmux', session: 'work' }],
    ['tmux a -t =exact', { kind: 'tmux', session: 'exact' }],
    ['zellij attach -c Janus', { kind: 'zellij', session: 'Janus' }],
    ['zellij a dev', { kind: 'zellij', session: 'dev' }],
    ['zellij -l compact --session dev', { kind: 'zellij', session: 'dev' }],
  ])('%s', (command, source) => {
    expect(historySourceOfCommand(command)).toEqual(source);
  });

  it.each(['htop', 'tmux', 'tmux ls', 'zellij', 'zellij ls -s', 'echo tmux new -s x'])(
    'finds no session in %s',
    (command) => {
      expect(historySourceOfCommand(command)).toBeNull();
    }
  );

  it('finds the session of an agent shortcut', () => {
    const agent = (session: AgentSession) =>
      agentCommand({
        harness: 'claude',
        skipPermissions: true,
        name: 'Janus',
        directory: '~/app',
        session,
      });
    expect(historySourceOfCommand(agent('tmux'))).toEqual({ kind: 'tmux', session: 'Janus' });
    expect(historySourceOfCommand(agent('zellij'))).toEqual({ kind: 'zellij', session: 'Janus' });
    expect(historySourceOfCommand(agent('none'))).toBeNull();
  });
});

test('sameSource', () => {
  expect(sameSource({ kind: 'tmux', session: 'a' }, { kind: 'tmux', session: 'a' })).toBe(true);
  expect(sameSource({ kind: 'tmux', session: 'a' }, { kind: 'zellij', session: 'a' })).toBe(false);
  expect(sameSource(null, null)).toBe(true);
  expect(sameSource(null, { kind: 'tmux', session: 'a' })).toBe(false);
});
