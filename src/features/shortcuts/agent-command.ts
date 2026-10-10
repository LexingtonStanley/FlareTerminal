import { cdPrefix, quote } from './shell';

/**
 * The command an agent shortcut types: a coding agent started in its folder, inside a tmux
 * or zellij session named after it. The session outlives the connection, so the next tap
 * (or a reconnect, which types the command again) reattaches to the same agent instead of
 * starting another.
 */

export type AgentHarness = 'claude' | 'codex' | 'hermes' | 'pi';

export type AgentSession = 'tmux' | 'zellij' | 'none';

export type AgentSetup = {
  harness: AgentHarness;
  session: AgentSession;
  /** Adds the harness's flag for running without permission prompts, when it has one. */
  skipPermissions: boolean;
};

type Harness = {
  label: string;
  program: string;
  /** Runs without asking before commands and edits; null when the harness never asks. */
  skipFlag: string | null;
};

/** In the order the form offers them. */
export const HARNESSES: Record<AgentHarness, Harness> = {
  claude: { label: 'Claude Code', program: 'claude', skipFlag: '--dangerously-skip-permissions' },
  // `--yolo` is an alias; the long flag says what it does.
  codex: {
    label: 'Codex',
    program: 'codex',
    skipFlag: '--dangerously-bypass-approvals-and-sandbox',
  },
  hermes: { label: 'Hermes', program: 'hermes', skipFlag: '--yolo' },
  // pi has no permission prompts.
  pi: { label: 'pi', program: 'pi', skipFlag: null },
};

export const SESSIONS: Record<AgentSession, { label: string }> = {
  tmux: { label: 'tmux' },
  zellij: { label: 'zellij' },
  none: { label: 'None' },
};

/**
 * The agent's name as a tmux or zellij session name (and a file name), safe to type
 * unquoted: letters, digits, `-` and `_`, capitals kept, anything else collapsed to `-`,
 * never a leading `-` (it would read as an option). Nothing left: the harness's name.
 */
export function agentSessionName(name: string, harness: AgentHarness): string {
  const safe = name
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return safe || harness;
}

/** The program and its arguments, e.g. `['claude', '--dangerously-skip-permissions']`. */
export function agentArgv({ harness, skipPermissions }: AgentSetup): string[] {
  const { program, skipFlag } = HARNESSES[harness];
  return skipPermissions && skipFlag ? [program, skipFlag] : [program];
}

/** A zellij layout with one pane running the agent. */
function zellijLayout([program, ...args]: string[]) {
  if (!args.length) return `layout { pane command="${program}"; }`;
  const quoted = args.map((arg) => `"${arg}"`).join(' ');
  return `layout { pane command="${program}" { args ${quoted}; }; }`;
}

export type AgentCommandInput = AgentSetup & {
  /** The agent's name, which names its session. */
  name: string;
  /** The folder it works in; optional. */
  directory: string;
};

/**
 * The line typed into the shell (bash or zsh syntax):
 * - none: `cd <folder> && <agent>`
 * - tmux: `cd <folder> && tmux new -A -s <Name> <agent> \; set -q mouse on` (attach, or
 *   create running the agent). Mouse mode, for that session only, lets a swipe scroll
 *   tmux's history; without it tmux keeps its history to itself.
 * - zellij: writes a layout that runs the agent to `~/.config/zellij/layouts/flare-<name>.kdl`
 *   (prefixed, so it can't overwrite a layout of the person's own), then attaches to the
 *   session or starts it with that layout. `zellij attach -c` can't run a command.
 */
export function agentCommand(input: AgentCommandInput): string {
  const argv = agentArgv(input);
  const cd = cdPrefix(input.directory);
  const session = agentSessionName(input.name, input.harness);

  switch (input.session) {
    case 'none':
      return `${cd}${argv.join(' ')}`;
    case 'tmux':
      return `${cd}tmux new -A -s ${session} ${argv.join(' ')} \\; set -q mouse on`;
    case 'zellij': {
      const layout = `flare-${session.toLowerCase()}`;
      return (
        `mkdir -p ~/.config/zellij/layouts && ` +
        `echo ${quote(zellijLayout(argv))} > ~/.config/zellij/layouts/${layout}.kdl && ` +
        `${cd}if zellij ls -s 2>/dev/null | grep -qx ${session}; ` +
        `then zellij attach ${session}; else zellij -s ${session} -n ${layout}; fi`
      );
    }
  }
}
