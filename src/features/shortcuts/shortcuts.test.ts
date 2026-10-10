import {
  DEFAULT_AGENT,
  groupOptions,
  groupShortcuts,
  looksDestructive,
  migrateShortcut,
  newShortcutInput,
  SHORTCUT_PRESETS,
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
  confirm: false,
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
  confirm: false,
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

    expect(migrated).toEqual({ ...saved, group: '', agent: null, confirm: false });
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
      confirm: false,
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

  it('needs a preset’s placeholder filled in', () => {
    const restart = { ...agentInput(), agent: null, command: 'sudo systemctl restart <service>' };
    expect(validateShortcut(restart).command).toBe('Replace <service> with the service’s name');
    expect(validateShortcut({ ...restart, command: 'sudo systemctl restart nginx' })).toEqual({});
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
      confirm: false,
    });
    expect(startupCommand(saved)).toBe(JANUS_ZELLIJ);
  });

  it('asks before running only for a plain command', () => {
    const plain = { ...agentInput(), agent: null, command: 'sudo reboot', confirm: true };
    expect(toShortcut(plain, 'k1').confirm).toBe(true);
    expect(toShortcut({ ...plain, agent: DEFAULT_AGENT }, 'k1').confirm).toBe(false);
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

describe('looksDestructive', () => {
  it('flags commands that restart, stop, reboot or delete', () => {
    const risky = [
      'sudo reboot',
      'sudo shutdown -h now',
      'sudo systemctl restart nginx',
      'systemctl --user stop app.service',
      'sudo service postgresql restart',
      'docker compose down',
      'docker rm -f web',
      'docker system prune -a',
      'kubectl delete pod web-1',
      'kubectl rollout restart deploy/web',
      'rm -rf ~/build',
      'rm --recursive old',
      'rm notes.txt',
      'git reset --hard origin/main',
      'git clean -fdx',
      'git push --force-with-lease',
      'git push -f origin main',
      'pkill -f node',
      'sudo apt-get upgrade -y',
      'brew upgrade',
    ];
    expect(risky.filter((command) => !looksDestructive(command))).toEqual([]);
  });

  it('leaves commands that only look or start things alone', () => {
    const safe = [
      'df -h',
      'docker ps',
      'docker logs -f web',
      'journalctl -f -n 50',
      'systemctl --failed',
      'systemctl status nginx',
      'git pull --ff-only',
      'git push',
      'tmux new -A -s main',
      'htop',
      'kubectl get pods',
      'npm run dev',
    ];
    expect(safe.filter(looksDestructive)).toEqual([]);
  });

  it('flags the presets that change things', () => {
    expect(
      SHORTCUT_PRESETS.filter(({ command }) => looksDestructive(command)).map(({ label }) => label)
    ).toEqual(['Restart a service', 'Reboot']);
  });
});
