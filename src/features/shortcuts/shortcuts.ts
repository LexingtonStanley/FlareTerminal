/**
 * Shortcuts: one tap to open a connection and run a command in it, e.g. Claude Code in
 * a tmux session that survives the phone disconnecting.
 */

export type Shortcut = {
  id: string;
  name: string;
  connectionId: string;
  /** Typed into the shell once connected. */
  command: string;
  /** Optional folder to start in (`~/code/app`). */
  directory: string;
};

export type ShortcutInput = Omit<Shortcut, 'id'>;

export type ShortcutErrors = Partial<Record<keyof ShortcutInput, string>>;

export type ShortcutPreset = { label: string; name: string; command: string };

/**
 * `tmux new -A` and `zellij attach -c` attach to the named session when it exists and
 * create it (running the command) when it doesn't, so the same tap resumes the agent.
 */
export const SHORTCUT_PRESETS: ShortcutPreset[] = [
  { label: 'Claude in tmux', name: 'Claude', command: 'tmux new -A -s claude claude' },
  { label: 'Claude in zellij', name: 'Claude', command: 'zellij attach -c claude -- claude' },
  { label: 'Claude', name: 'Claude', command: 'claude' },
  { label: 'Claude, continue', name: 'Claude (continue)', command: 'claude --continue' },
  { label: 'tmux', name: 'tmux', command: 'tmux new -A -s main' },
];

export const EMPTY_SHORTCUT_INPUT: ShortcutInput = {
  name: '',
  connectionId: '',
  command: '',
  directory: '',
};

export function newShortcutId(): string {
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function validateShortcut(input: ShortcutInput): ShortcutErrors {
  const errors: ShortcutErrors = {};
  if (!input.name.trim()) errors.name = 'Enter a name';
  if (!input.connectionId) errors.connectionId = 'Choose a connection';
  if (!input.command.trim()) errors.command = 'Enter a command, or pick one above';
  if (/[\r\n]/.test(input.command)) errors.command = 'Use a single line';
  return errors;
}

/** Quotes a folder for the shell, keeping a leading `~/` so it expands. */
function quoteDirectory(directory: string) {
  const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
  if (directory === '~') return '~';
  if (directory.startsWith('~/')) return `~/${quote(directory.slice(2))}`;
  return quote(directory);
}

/** The line typed into the shell: `cd <folder> && <command>`. */
export function startupCommand({ command, directory }: Pick<Shortcut, 'command' | 'directory'>) {
  const folder = directory.trim();
  return folder ? `cd ${quoteDirectory(folder)} && ${command.trim()}` : command.trim();
}
