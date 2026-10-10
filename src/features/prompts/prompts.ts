import { HARNESSES, type AgentHarness } from '@/features/shortcuts/agent-command';

/**
 * What the composer suggests above its field: the agent's own slash commands, and prompts the
 * person saved to send again ("Run the tests and fix what fails"). Pure, so the strip only
 * draws what this works out.
 */

export type SavedPrompt = { id: string; text: string };

export type SlashCommand = { command: string; description: string };

/**
 * Each agent's most used built-in commands, in the order they're offered. Taken from the
 * agents' own references (Claude Code's commands page, Codex's `slash_command.rs`, Gemini
 * CLI's and OpenCode's command docs, Aider's in-chat commands, Hermes's `commands.py`, pi's
 * usage docs) in October 2026. Short on purpose: the agent's own `/` menu has the rest, and a
 * command one of them drops only stops doing anything.
 */
export const SLASH_COMMANDS: Record<AgentHarness, SlashCommand[]> = {
  claude: [
    { command: '/compact', description: 'Summarize to free up context' },
    { command: '/clear', description: 'Start a new conversation' },
    { command: '/context', description: 'Show what fills the context window' },
    { command: '/model', description: 'Switch the model' },
    { command: '/resume', description: 'Resume an earlier conversation' },
    { command: '/rewind', description: 'Go back to an earlier point' },
    { command: '/review', description: 'Review the current changes' },
    { command: '/usage', description: 'Show the cost and plan limits' },
    { command: '/init', description: 'Write a CLAUDE.md for the project' },
  ],
  codex: [
    { command: '/compact', description: 'Summarize to free up context' },
    { command: '/new', description: 'Start a new chat' },
    { command: '/model', description: 'Choose the model and reasoning effort' },
    { command: '/review', description: 'Review the current changes' },
    { command: '/diff', description: 'Show the git diff' },
    { command: '/status', description: 'Show the settings and token use' },
    { command: '/resume', description: 'Resume a saved chat' },
    { command: '/plan', description: 'Switch to plan mode' },
    { command: '/init', description: 'Write an AGENTS.md for the project' },
  ],
  gemini: [
    { command: '/compress', description: 'Summarize to free up context' },
    { command: '/clear', description: 'Clear the context and start over' },
    { command: '/model', description: 'Switch the model' },
    { command: '/rewind', description: 'Go back to an earlier point' },
    { command: '/resume', description: 'Resume an earlier session' },
    { command: '/plan', description: 'Switch to read-only plan mode' },
    { command: '/stats', description: 'Show the session’s statistics' },
    { command: '/memory', description: 'Show or change the GEMINI.md memory' },
    { command: '/init', description: 'Write a GEMINI.md for the project' },
  ],
  opencode: [
    { command: '/compact', description: 'Summarize to free up context' },
    { command: '/new', description: 'Start a new session' },
    { command: '/undo', description: 'Undo the last message and its changes' },
    { command: '/redo', description: 'Redo what /undo took back' },
    { command: '/models', description: 'Choose the model' },
    { command: '/sessions', description: 'Switch to another session' },
    { command: '/details', description: 'Show or hide tool details' },
    { command: '/init', description: 'Write an AGENTS.md for the project' },
  ],
  // Aider works on the files added to its chat, so those commands come first.
  aider: [
    { command: '/add', description: 'Add files to the chat' },
    { command: '/drop', description: 'Remove files from the chat' },
    { command: '/ask', description: 'Ask without editing files' },
    { command: '/code', description: 'Ask for changes to the code' },
    { command: '/architect', description: 'Plan with one model, edit with another' },
    { command: '/diff', description: 'Show the changes since the last message' },
    { command: '/undo', description: 'Undo aider’s last commit' },
    { command: '/test', description: 'Run tests and share what fails' },
    { command: '/clear', description: 'Clear the chat history' },
    { command: '/tokens', description: 'Show the tokens in use' },
    { command: '/model', description: 'Switch the model' },
  ],
  hermes: [
    { command: '/compress', description: 'Compress to free up context' },
    { command: '/new', description: 'Start a new session' },
    { command: '/retry', description: 'Send the last message again' },
    { command: '/undo', description: 'Go back a turn and prompt again' },
    { command: '/model', description: 'Switch the model' },
    { command: '/context', description: 'Show what fills the context window' },
    { command: '/status', description: 'Show the session, model and tokens' },
    { command: '/sessions', description: 'Browse and resume sessions' },
    { command: '/review', description: 'Have a subagent review the work' },
    { command: '/diff', description: 'Show the git changes' },
  ],
  pi: [
    { command: '/compact', description: 'Summarize to free up context' },
    { command: '/new', description: 'Start a new session' },
    { command: '/model', description: 'Switch the model' },
    { command: '/thinking', description: 'Choose how much the model reasons' },
    { command: '/resume', description: 'Open another saved session' },
    { command: '/tree', description: 'Go back to an earlier point' },
    { command: '/fork', description: 'Branch off from an earlier message' },
    { command: '/session', description: 'Show the session’s tokens and cost' },
  ],
};

/**
 * The agent a plain command runs, when it's a command of its own (`cd ~/app && claude`), so
 * shortcuts made before agent shortcuts existed get their commands too. Only a command's
 * first word counts: `ssh pi` reaches a host, it doesn't run pi.
 */
export function agentIn(command: string | null): AgentHarness | null {
  if (!command) return null;
  for (const part of command.split(/&&|\|\||[;|]/)) {
    const [program] = part.trim().split(/\s+/);
    for (const [harness, { program: name }] of Object.entries(HARNESSES)) {
      if (program === name) return harness as AgentHarness;
    }
  }
  return null;
}

export type Suggestion =
  | { kind: 'command'; text: string; description: string }
  | { kind: 'prompt'; id: string; text: string }
  /** Keep the draft as a saved prompt. */
  | { kind: 'save' };

const startsWith = (text: string, prefix: string) =>
  text.toLowerCase().startsWith(prefix.toLowerCase()) && text !== prefix;

/**
 * What to offer for the draft so far:
 * - nothing written: the agent's commands, then the saved prompts;
 * - a command being written (`/co`): the commands and saved prompts it begins;
 * - anything else: saving it (unless it's saved already), then the saved prompts it begins.
 */
export function suggest(
  draft: string,
  agent: AgentHarness | null,
  saved: SavedPrompt[]
): Suggestion[] {
  const commands = agent ? SLASH_COMMANDS[agent] : [];
  const command = ({ command, description }: SlashCommand): Suggestion => ({
    kind: 'command',
    text: command,
    description,
  });
  const prompt = ({ id, text }: SavedPrompt): Suggestion => ({ kind: 'prompt', id, text });

  if (!draft.trim()) return [...commands.map(command), ...saved.map(prompt)];

  const matches = saved.filter(({ text }) => startsWith(text, draft)).map(prompt);
  if (/^\/\S*$/.test(draft)) {
    return [
      ...commands.filter(({ command }) => startsWith(command, draft)).map(command),
      ...matches,
    ];
  }
  return isSaved(draft, saved) ? matches : [{ kind: 'save' }, ...matches];
}

export function isSaved(draft: string, saved: SavedPrompt[]): boolean {
  return saved.some(({ text }) => text === draft.trim());
}

/**
 * The quiet line the strip shows when it has nothing to offer, so it keeps its height (a
 * strip that came and went would resize the terminal, and the host would redraw).
 */
export function quietHint(draft: string, agent: AgentHarness | null, saved: SavedPrompt[]): string {
  const [first = ''] = draft.trim().split(/\s/);
  const command = agent ? SLASH_COMMANDS[agent].find(({ command }) => command === first) : null;
  if (command) return command.description;
  if (isSaved(draft, saved)) return 'Saved in your prompts';
  if (draft.startsWith('/')) return 'No matching commands';
  return 'Prompts you save show here';
}

/** A saved prompt as a chip shows it: its first line. */
export function promptTitle(text: string): string {
  const [first = ''] = text.split('\n');
  return text.includes('\n') ? `${first.trimEnd()} …` : first;
}

export function newPromptId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A stored prompt, or null when it isn't one (storage from a newer or broken version). */
export function toSavedPrompt(value: unknown): SavedPrompt | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, text } = value as Partial<SavedPrompt>;
  return typeof id === 'string' && typeof text === 'string' && text.trim() ? { id, text } : null;
}
