import {
  DEFAULT_AGENT,
  groupOptions,
  groupShortcuts,
  migrateShortcut,
  newShortcutInput,
  startupCommand,
  toShortcut,
  validateShortcut,
  withGeneratedCommand,
  type Shortcut,
  type ShortcutInput,
} from './shortcuts';

const JANUS_ZELLIJ =
  `mkdir -p ~/.config/zellij/layouts && ` +
  `echo 'layout { pane command="claude"; }' > ~/.config/zellij/layouts/flare-janus.kdl && ` +
  `cd ~/agents/janus && ` +
  `if zellij ls -s 2>/dev/null | grep -qx Janus; then zellij attach Janus; ` +
  `else zellij -s Janus -n flare-janus; fi`;

const agentInput = (fields: Partial<ShortcutInput> = {}): ShortcutInput => ({
  name: 'Janus',
  connectionId: 'devbox',
  command: '',
  directory: '~/agents/janus',
  group: 'Agents',
  agent: { ...DEFAULT_AGENT, session: 'zellij' },
  ...fields,
});

const shortcut = (fields: Partial<Shortcut>): Shortcut => ({
  id: 'k1',
  name: 'Shortcut',
  connectionId: 'devbox',
  command: 'df -h',
  directory: '',
  group: '',
  agent: null,
  ...fields,
});

describe('migrateShortcut', () => {
  it('reads shortcuts saved before agents and groups as ungrouped commands', () => {
    const saved = {
      id: 'k1',
      name: 'Claude',
      connectionId: 'devbox',
      command: 'tmux new -A -s claude claude',
      directory: '~/code/flare',
    };

    const migrated = migrateShortcut(saved);

    expect(migrated).toEqual({ ...saved, group: '', agent: null });
    expect(startupCommand(migrated!)).toBe('cd ~/code/flare && tmux new -A -s claude claude');
  });

  it('keeps an agent’s setup and makes its command again', () => {
    const agent = { harness: 'claude', session: 'zellij', skipPermissions: false };
    const saved = {
      ...agentInput(),
      id: 'k2',
      command: 'old',
      agent: { ...agent, commandEdited: false },
    };

    expect(migrateShortcut(saved)).toEqual({ ...saved, command: JANUS_ZELLIJ });
  });

  it('keeps a command edited by hand', () => {
    const saved = {
      ...agentInput(),
      id: 'k2',
      command: 'claude --continue',
      agent: { ...DEFAULT_AGENT, commandEdited: true },
    };

    expect(migrateShortcut(saved)?.command).toBe('claude --continue');
  });

  it('runs an agent it doesn’t know (from a newer version) as saved', () => {
    const saved = {
      ...agentInput(),
      id: 'k3',
      command: 'cd ~/w && gemini',
      agent: { harness: 'gemini', session: 'tmux', skipPermissions: true, commandEdited: false },
    };

    const migrated = migrateShortcut(saved)!;

    expect(migrated.agent?.commandEdited).toBe(true);
    expect(startupCommand(migrated)).toBe('cd ~/w && gemini');
  });

  it('drops records it cannot read', () => {
    expect(migrateShortcut(null)).toBeNull();
    expect(migrateShortcut('claude')).toBeNull();
    expect(migrateShortcut({ name: 'no id', command: 'ls' })).toBeNull();
    expect(migrateShortcut({ id: 'k1', name: 'no command' })).toBeNull();
  });
});

describe('newShortcutInput', () => {
  it('starts as Claude Code in tmux, in the Agents group', () => {
    expect(newShortcutInput()).toEqual({
      name: '',
      connectionId: '',
      command: 'tmux new -A -s claude claude \\; set -q mouse on',
      directory: '',
      group: 'Agents',
      agent: DEFAULT_AGENT,
    });
  });

  it('starts from the last agent’s setup', () => {
    const last = { harness: 'codex', session: 'zellij', skipPermissions: true } as const;
    const input = newShortcutInput([
      shortcut({ agent: { ...DEFAULT_AGENT, harness: 'hermes' } }),
      shortcut({ agent: { ...last, commandEdited: true } }),
      shortcut({ agent: null }),
    ]);

    expect(input.agent).toEqual({ ...last, commandEdited: false });
    expect(input.command).toContain('args "--dangerously-bypass-approvals-and-sandbox"');
  });
});

describe('withGeneratedCommand', () => {
  it('makes an agent’s command from its setup, name and folder', () => {
    expect(withGeneratedCommand(agentInput()).command).toBe(JANUS_ZELLIJ);
  });

  it('leaves a command edited by hand, and a plain command, alone', () => {
    const edited = agentInput({
      command: 'claude --continue',
      agent: { ...DEFAULT_AGENT, commandEdited: true },
    });
    expect(withGeneratedCommand(edited)).toBe(edited);

    const plain = agentInput({ command: 'df -h', agent: null });
    expect(withGeneratedCommand(plain)).toBe(plain);
  });
});

describe('validateShortcut', () => {
  it('needs a name, a connection and a command', () => {
    expect(validateShortcut(agentInput({ name: ' ', connectionId: '', agent: null }))).toEqual({
      name: 'Enter a name',
      connectionId: 'Choose a connection',
      command: 'Enter a command, or pick one above',
    });
    expect(validateShortcut(agentInput({ command: '' })).command).toBe(
      'Enter a command, or use the generated one'
    );
  });

  it('takes a single line', () => {
    expect(validateShortcut(agentInput({ command: 'ls\ncd /' })).command).toBe('Use a single line');
  });
});

describe('toShortcut', () => {
  it('trims what was typed and makes an agent’s command', () => {
    const saved = toShortcut(
      agentInput({ name: ' Janus ', directory: ' ~/agents/janus ', group: ' Agents ' }),
      'k1'
    );

    expect(saved).toEqual({
      id: 'k1',
      name: 'Janus',
      connectionId: 'devbox',
      command: JANUS_ZELLIJ,
      directory: '~/agents/janus',
      group: 'Agents',
      agent: { ...DEFAULT_AGENT, session: 'zellij' },
    });
    expect(startupCommand(saved)).toBe(JANUS_ZELLIJ);
  });

  it('keeps a command edited by hand', () => {
    const saved = toShortcut(
      agentInput({
        command: ' claude --continue ',
        agent: { ...DEFAULT_AGENT, commandEdited: true },
      }),
      'k1'
    );

    expect(saved.command).toBe('claude --continue');
    expect(startupCommand(saved)).toBe('claude --continue');
  });
});

describe('startupCommand', () => {
  it('changes to a plain command’s folder first', () => {
    expect(startupCommand(shortcut({ directory: '~/My Code' }))).toBe("cd ~/'My Code' && df -h");
    expect(startupCommand(shortcut({}))).toBe('df -h');
  });
});

describe('groupShortcuts', () => {
  it('groups in the order groups first appear, case aside, with the rest apart', () => {
    const janus = shortcut({ id: 'a', group: 'Agents' });
    const backup = shortcut({ id: 'b', group: 'Maintenance' });
    const loose = shortcut({ id: 'c', group: ' ' });
    const swayze = shortcut({ id: 'd', group: 'agents ' });

    expect(groupShortcuts([janus, backup, loose, swayze])).toEqual({
      groups: [
        { name: 'Agents', shortcuts: [janus, swayze] },
        { name: 'Maintenance', shortcuts: [backup] },
      ],
      ungrouped: [loose],
    });
  });
});

describe('groupOptions', () => {
  it('offers the groups in use, then the suggestions not among them', () => {
    expect(groupOptions([])).toEqual(['Agents', 'Maintenance']);
    expect(groupOptions([shortcut({ group: 'Deploys' }), shortcut({ group: 'agents' })])).toEqual([
      'Deploys',
      'agents',
      'Maintenance',
    ]);
  });
});
