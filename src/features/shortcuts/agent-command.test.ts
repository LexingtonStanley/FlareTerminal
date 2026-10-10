import {
  agentArgv,
  agentCommand,
  agentSessionName,
  HARNESSES,
  type AgentCommandInput,
  type AgentHarness,
  type AgentSession,
} from './agent-command';

const janus = (fields: Partial<AgentCommandInput> = {}): AgentCommandInput => ({
  name: 'Janus',
  directory: '~/agents/janus',
  harness: 'claude',
  session: 'zellij',
  skipPermissions: false,
  ...fields,
});

describe('agentCommand for the owner’s Janus agent', () => {
  it('starts Claude Code in zellij, the way it was written by hand', () => {
    expect(agentCommand(janus())).toBe(
      `mkdir -p ~/.config/zellij/layouts && ` +
        `echo 'layout { pane command="claude"; }' > ~/.config/zellij/layouts/flare-janus.kdl && ` +
        `cd ~/agents/janus && ` +
        `if zellij ls -s 2>/dev/null | grep -qx Janus; then zellij attach Janus; ` +
        `else zellij -s Janus -n flare-janus; fi`
    );
  });

  it('puts the skip-permissions flag in the layout’s args', () => {
    expect(agentCommand(janus({ skipPermissions: true }))).toBe(
      `mkdir -p ~/.config/zellij/layouts && ` +
        `echo 'layout { pane command="claude" { args "--dangerously-skip-permissions"; }; }' ` +
        `> ~/.config/zellij/layouts/flare-janus.kdl && ` +
        `cd ~/agents/janus && ` +
        `if zellij ls -s 2>/dev/null | grep -qx Janus; then zellij attach Janus; ` +
        `else zellij -s Janus -n flare-janus; fi`
    );
  });

  it('starts it in tmux', () => {
    expect(agentCommand(janus({ session: 'tmux', skipPermissions: true }))).toBe(
      'cd ~/agents/janus && tmux new -A -s Janus claude --dangerously-skip-permissions \\; set -q mouse on'
    );
  });

  it('starts it with no session', () => {
    expect(agentCommand(janus({ session: 'none' }))).toBe('cd ~/agents/janus && claude');
  });

  it('leaves out the cd without a folder', () => {
    expect(agentCommand({ ...janus({ directory: '  ' }), name: 'Swayze' })).toBe(
      `mkdir -p ~/.config/zellij/layouts && ` +
        `echo 'layout { pane command="claude"; }' > ~/.config/zellij/layouts/flare-swayze.kdl && ` +
        `if zellij ls -s 2>/dev/null | grep -qx Swayze; then zellij attach Swayze; ` +
        `else zellij -s Swayze -n flare-swayze; fi`
    );
    expect(agentCommand(janus({ directory: '', session: 'tmux' }))).toBe(
      'tmux new -A -s Janus claude \\; set -q mouse on'
    );
    expect(agentCommand(janus({ directory: '', session: 'none' }))).toBe('claude');
  });
});

describe('agentCommand for every agent and session', () => {
  const harnesses = Object.keys(HARNESSES) as AgentHarness[];
  const sessions: AgentSession[] = ['tmux', 'zellij', 'none'];
  const program: Record<AgentHarness, string> = {
    claude: 'claude --dangerously-skip-permissions',
    codex: 'codex --dangerously-bypass-approvals-and-sandbox',
    hermes: 'hermes --yolo',
    pi: 'pi',
  };
  const layoutPane: Record<AgentHarness, string> = {
    claude: 'pane command="claude" { args "--dangerously-skip-permissions"; };',
    codex: 'pane command="codex" { args "--dangerously-bypass-approvals-and-sandbox"; };',
    hermes: 'pane command="hermes" { args "--yolo"; };',
    pi: 'pane command="pi";',
  };

  const cases = harnesses.flatMap((harness) =>
    sessions.flatMap((session) => [true, false].map((skip) => [harness, session, skip] as const))
  );

  it.each(cases)('%s in %s, skipping permissions: %s', (harness, session, skipPermissions) => {
    const command = agentCommand({
      name: 'Ada',
      directory: '~/w',
      harness,
      session,
      skipPermissions,
    });
    const bare = HARNESSES[harness].program;
    const argv = skipPermissions ? program[harness] : bare;
    const pane = skipPermissions ? layoutPane[harness] : `pane command="${bare}";`;

    if (session === 'none') expect(command).toBe(`cd ~/w && ${argv}`);
    if (session === 'tmux')
      expect(command).toBe(`cd ~/w && tmux new -A -s Ada ${argv} \\; set -q mouse on`);
    if (session === 'zellij') {
      expect(command).toBe(
        `mkdir -p ~/.config/zellij/layouts && ` +
          `echo 'layout { ${pane} }' > ~/.config/zellij/layouts/flare-ada.kdl && ` +
          `cd ~/w && if zellij ls -s 2>/dev/null | grep -qx Ada; then zellij attach Ada; ` +
          `else zellij -s Ada -n flare-ada; fi`
      );
    }
  });
});

describe('agentArgv', () => {
  it('adds each harness’s own flag, and none for pi, which never asks', () => {
    expect(agentArgv({ harness: 'claude', session: 'none', skipPermissions: true })).toEqual([
      'claude',
      '--dangerously-skip-permissions',
    ]);
    expect(agentArgv({ harness: 'codex', session: 'none', skipPermissions: true })).toEqual([
      'codex',
      '--dangerously-bypass-approvals-and-sandbox',
    ]);
    expect(agentArgv({ harness: 'hermes', session: 'none', skipPermissions: true })).toEqual([
      'hermes',
      '--yolo',
    ]);
    expect(agentArgv({ harness: 'pi', session: 'none', skipPermissions: true })).toEqual(['pi']);
    expect(agentArgv({ harness: 'claude', session: 'none', skipPermissions: false })).toEqual([
      'claude',
    ]);
  });
});

describe('agentSessionName', () => {
  it.each([
    ['Janus', 'Janus'],
    ['  Swayze ', 'Swayze'],
    ['my agent', 'my-agent'],
    ['web_app-2', 'web_app-2'],
    ['Ada & Grace: v2.0', 'Ada-Grace-v2-0'],
    ["it's $(rm -rf ~)", 'it-s-rm-rf'],
    ['--flag', 'flag'],
    ['Zoë', 'Zo'],
  ])('makes %j safe as %j', (name, expected) => {
    expect(agentSessionName(name, 'claude')).toBe(expected);
  });

  it('falls back to the harness’s name', () => {
    expect(agentSessionName('', 'codex')).toBe('codex');
    expect(agentSessionName('!!!', 'pi')).toBe('pi');
  });
});

describe('agentCommand with odd folders and names', () => {
  it('quotes a folder that needs it, keeping ~/ expandable', () => {
    expect(agentCommand(janus({ session: 'none', directory: '~/My Agents/janus' }))).toBe(
      "cd ~/'My Agents/janus' && claude"
    );
    expect(agentCommand(janus({ session: 'none', directory: "/srv/ada's app" }))).toBe(
      "cd '/srv/ada'\\''s app' && claude"
    );
    expect(agentCommand(janus({ session: 'none', directory: '/srv/$HOME;ls' }))).toBe(
      "cd '/srv/$HOME;ls' && claude"
    );
    expect(agentCommand(janus({ session: 'none', directory: '~' }))).toBe('cd ~ && claude');
  });

  it('names the session and layout from a name with spaces and symbols', () => {
    const command = agentCommand(janus({ name: 'Code Review: PRs', directory: '' }));
    expect(command).toContain('> ~/.config/zellij/layouts/flare-code-review-prs.kdl && ');
    expect(command).toContain('grep -qx Code-Review-PRs; then zellij attach Code-Review-PRs;');
    expect(command).toContain('else zellij -s Code-Review-PRs -n flare-code-review-prs; fi');
  });

  it('names an unnamed agent after its harness', () => {
    expect(agentCommand(janus({ name: ' ', session: 'tmux', harness: 'hermes' }))).toBe(
      'cd ~/agents/janus && tmux new -A -s hermes hermes \\; set -q mouse on'
    );
  });
});
