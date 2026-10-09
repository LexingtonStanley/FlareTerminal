import { agentCommand, HARNESSES, SESSIONS, type AgentSetup } from './agent-command';
import { cdPrefix } from './shell';

/**
 * Shortcuts: one tap to open a connection and run a command in it. An agent shortcut
 * builds its command from a setup (Claude Code in zellij in ~/agents/janus, say); a plain
 * one runs whatever was typed. Home shows them in groups (Agents, Maintenance).
 */

export type ShortcutAgent = AgentSetup & {
  /** The command was edited by hand, so changing the setup no longer rewrites it. */
  commandEdited: boolean;
};

export type Shortcut = {
  id: string;
  name: string;
  connectionId: string;
  /** Typed into the shell once connected. An agent's includes the `cd` to its folder. */
  command: string;
  /** Optional folder to start in (`~/code/app`). */
  directory: string;
  /** The heading it's shown under on Home; '' for none. */
  group: string;
  /** How an agent shortcut's command is made; null for a plain command. */
  agent: ShortcutAgent | null;
};

export type ShortcutInput = Omit<Shortcut, 'id'>;

export type ShortcutErrors = Partial<Record<keyof ShortcutInput, string>>;

export type ShortcutPreset = { label: string; name: string; command: string };

/** Commands worth one tap that aren't agents (agents have their own kind of shortcut). */
export const SHORTCUT_PRESETS: ShortcutPreset[] = [
  // Attach to the session `main`, or create it.
  { label: 'tmux', name: 'tmux', command: 'tmux new -A -s main' },
  { label: 'zellij', name: 'zellij', command: 'zellij attach -c main' },
  { label: 'Git pull', name: 'Git pull', command: 'git pull --ff-only' },
  { label: 'Disk space', name: 'Disk space', command: 'df -h' },
  { label: 'htop', name: 'htop', command: 'htop' },
];

export const AGENTS_GROUP = 'Agents';

/** Offered under the group field, after the groups already in use. */
export const SUGGESTED_GROUPS = [AGENTS_GROUP, 'Maintenance'];

export const DEFAULT_AGENT: ShortcutAgent = {
  harness: 'claude',
  session: 'tmux',
  skipPermissions: false,
  commandEdited: false,
};

/**
 * A new shortcut: an agent in the Agents group, set up like the last agent shortcut
 * (someone who runs Claude Code in zellij will want the next one the same).
 */
export function newShortcutInput(existing: Shortcut[] = []): ShortcutInput {
  const last = [...existing].reverse().find((shortcut) => shortcut.agent)?.agent;
  return withGeneratedCommand({
    name: '',
    connectionId: '',
    command: '',
    directory: '',
    group: AGENTS_GROUP,
    agent: last ? { ...last, commandEdited: false } : DEFAULT_AGENT,
  });
}

/** The command an agent shortcut's setup, name and folder make; null for a plain one. */
export function generatedCommand({ agent, name, directory }: ShortcutInput): string | null {
  return agent ? agentCommand({ ...agent, name, directory }) : null;
}

/** Rewrites an agent shortcut's command from its setup, unless it was edited by hand. */
export function withGeneratedCommand(input: ShortcutInput): ShortcutInput {
  const command = generatedCommand(input);
  return command === null || input.agent?.commandEdited ? input : { ...input, command };
}

export function newShortcutId(): string {
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function validateShortcut(input: ShortcutInput): ShortcutErrors {
  const errors: ShortcutErrors = {};
  if (!input.name.trim()) errors.name = 'Enter a name';
  if (!input.connectionId) errors.connectionId = 'Choose a connection';
  if (!input.command.trim()) {
    errors.command = input.agent
      ? 'Enter a command, or use the generated one'
      : 'Enter a command, or pick one above';
  }
  if (/[\r\n]/.test(input.command)) errors.command = 'Use a single line';
  return errors;
}

/** Builds the saved record from valid form input. */
export function toShortcut(input: ShortcutInput, id: string): Shortcut {
  const trimmed = {
    ...input,
    name: input.name.trim(),
    directory: input.directory.trim(),
    command: input.command.trim(),
  };
  const { name, connectionId, command, directory, agent } = withGeneratedCommand(trimmed);
  return { id, name, connectionId, command, directory, group: input.group.trim(), agent };
}

/** The line typed into the shell: `cd <folder> && <command>` (an agent's has its own cd). */
export function startupCommand({
  command,
  directory,
  agent,
}: Pick<Shortcut, 'command' | 'directory' | 'agent'>) {
  return agent ? command.trim() : `${cdPrefix(directory)}${command.trim()}`;
}

/**
 * Reads a saved shortcut. Those saved before agents and groups were plain commands with no
 * group. An agent's command is made again, so it picks up changes to how commands are made
 * (unless it was edited by hand).
 */
export function migrateShortcut(stored: unknown): Shortcut | null {
  if (!stored || typeof stored !== 'object') return null;
  const record = stored as Partial<Shortcut>;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  if (!text(record.id) || !text(record.command)) return null;
  return {
    id: text(record.id),
    ...withGeneratedCommand({
      name: text(record.name),
      connectionId: text(record.connectionId),
      command: text(record.command),
      directory: text(record.directory),
      group: text(record.group),
      agent: migrateAgent(record.agent),
    }),
  };
}

/** An agent setup this version doesn't know (from a newer one) keeps its command as is. */
function migrateAgent(stored: unknown): ShortcutAgent | null {
  if (!stored || typeof stored !== 'object') return null;
  const { harness, session, skipPermissions, commandEdited } = stored as Record<string, unknown>;
  const known = isKey(HARNESSES, harness) && isKey(SESSIONS, session);
  return {
    harness: known ? harness : DEFAULT_AGENT.harness,
    session: known ? session : DEFAULT_AGENT.session,
    skipPermissions: skipPermissions === true,
    commandEdited: !known || commandEdited === true,
  };
}

const isKey = <T extends object>(object: T, key: unknown): key is keyof T =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key);

const groupKey = (group: string) => group.trim().toLowerCase();

export function sameGroup(a: string, b: string): boolean {
  return groupKey(a) === groupKey(b);
}

export type ShortcutGroup = { name: string; shortcuts: Shortcut[] };

/**
 * Named groups in the order they first appear (case aside, so "agents" joins "Agents"),
 * and the shortcuts with no group.
 */
export function groupShortcuts(shortcuts: Shortcut[]): {
  groups: ShortcutGroup[];
  ungrouped: Shortcut[];
} {
  const groups = new Map<string, ShortcutGroup>();
  const ungrouped: Shortcut[] = [];
  for (const shortcut of shortcuts) {
    const key = groupKey(shortcut.group);
    if (!key) {
      ungrouped.push(shortcut);
      continue;
    }
    const group = groups.get(key) ?? { name: shortcut.group.trim(), shortcuts: [] };
    group.shortcuts.push(shortcut);
    groups.set(key, group);
  }
  return { groups: [...groups.values()], ungrouped };
}

/** Groups to offer: those in use, then the suggestions not among them. */
export function groupOptions(shortcuts: Shortcut[]): string[] {
  const options: string[] = [];
  for (const group of [
    ...groupShortcuts(shortcuts).groups.map(({ name }) => name),
    ...SUGGESTED_GROUPS,
  ]) {
    if (!options.some((option) => sameGroup(option, group))) options.push(group);
  }
  return options;
}
