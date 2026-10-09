import { quote } from '@/features/shortcuts/shell';

/**
 * Where an agent's whole history lives when it runs in tmux or zellij: the multiplexer keeps
 * it, and the terminal only ever sees the screen. Reading mode asks the host for it over a
 * command channel beside the shell (SSH only).
 */
export type HistorySource = { kind: 'tmux' | 'zellij'; session: string };

/** Printed before the list of sessions, so anything a login script prints is skipped. */
const SESSIONS_MARKER = 'flare-sessions';
/** Printed before the history, so a failed read (no such session) prints nothing at all. */
const HISTORY_MARKER = 'flare-history';
/** The newest lines of a history that reading mode reads: plenty, and quick on a phone. */
export const HISTORY_LINES = 10_000;

/**
 * A script for `sh -s` that lists the host's tmux and zellij sessions, then prints the
 * history of `source` (its scrollback and screen, with colours, the newest HISTORY_LINES)
 * if there is one. Written to
 * sh's input, so it works whatever the login shell is; every command reads /dev/null, so
 * none can swallow the rest of the script.
 * - tmux: `capture-pane -J` joins wrapped lines; `=name:` matches the session exactly.
 * - zellij: 0.44 and later print to stdout (`--ansi` keeps colours); older versions only
 *   write a file, without colours.
 */
export function readingScript(source: HistorySource | null): string {
  const lines = [
    `echo ${SESSIONS_MARKER}`,
    `tmux list-sessions -F '#{session_name}' </dev/null 2>/dev/null | sed 's/^/tmux /'`,
    `zellij list-sessions --short --no-formatting </dev/null 2>/dev/null | sed 's/^/zellij /'`,
  ];
  if (source) {
    const name = quote(source.session);
    const read =
      source.kind === 'tmux'
        ? `tmux capture-pane -p -J -e -S - -E - -t ${quote(`=${source.session}:`)} </dev/null >"$f" 2>/dev/null`
        : `zellij --session ${name} action dump-screen --full --ansi </dev/null >"$f" 2>/dev/null || ` +
          `zellij --session ${name} action dump-screen --full "$f" </dev/null >/dev/null 2>&1`;
    lines.push(
      'f=$(mktemp) || exit 0',
      `if ${read}; then echo ${HISTORY_MARKER}; tail -n ${HISTORY_LINES} "$f"; fi`,
      'rm -f "$f"'
    );
  }
  return [...lines, 'exit 0', ''].join('\n');
}

export type Reading = {
  /** The host's tmux and zellij sessions. */
  sessions: HistorySource[];
  /** The history with its escape codes, or null when there was none to read. */
  history: string | null;
};

/** What the reading script printed. */
export function parseReading(output: string): Reading {
  const start = output.indexOf(`${SESSIONS_MARKER}\n`);
  if (start === -1) return { sessions: [], history: null };
  const rest = output.slice(start + SESSIONS_MARKER.length + 1);
  // The list ends where the history starts; every line of it starts with `tmux ` or `zellij `.
  const marker = `${HISTORY_MARKER}\n`;
  const after = rest.indexOf(`\n${marker}`);
  const historyAt = rest.startsWith(marker) ? 0 : after === -1 ? -1 : after + 1;
  const list = historyAt === -1 ? rest : rest.slice(0, historyAt);
  const history = historyAt === -1 ? null : rest.slice(historyAt + marker.length);

  const sessions: HistorySource[] = [];
  for (const line of list.split('\n')) {
    const match = /^(tmux|zellij) (.+)$/.exec(line.trimEnd());
    if (!match) continue;
    const source = { kind: match[1] as HistorySource['kind'], session: match[2] };
    if (!sessions.some((known) => sameSource(known, source))) sessions.push(source);
  }
  return { sessions, history };
}

export function sameSource(a: HistorySource | null, b: HistorySource | null): boolean {
  return a?.kind === b?.kind && a?.session === b?.session;
}

/** A word as typed: quoted, or up to the next space. */
const WORD = `('[^']*'|"[^"]*"|\\S+)`;
/** `tmux new -A -s main`, `tmux attach -t main`, `tmux new-session -As main`. */
const TMUX_SESSION = new RegExp(
  `^tmux\\s+(?:new-session|new|attach-session|attach|at|a)\\b(?:\\s.*?)?\\s-[A-Za-z]*[st]\\s*${WORD}`
);
/** `zellij attach main`, `zellij a -c main`, `zellij -s main`, `zellij -l x --session main`. */
const ZELLIJ_SESSION = new RegExp(
  `^zellij\\s+(?:(?:attach|a)\\s+(?:(?:-c|--create|-b|--create-background|-f|--force-run-commands)\\s+)*(?!-)${WORD}` +
    `|(?:-{1,2}[a-z-]+\\s+\\S+\\s+)*?(?:-s|--session)\\s+${WORD})`
);

/**
 * The tmux or zellij session a command opens, such as the tmux preset's
 * `tmux new -A -s main` or an agent shortcut's: the first command in the line that names
 * one, after any `cd … &&`, inside an `if`.
 */
export function historySourceOfCommand(command: string): HistorySource | null {
  for (const part of command.split(/&&|\|\||[;|]|\b(?:if|then|else)\b/)) {
    const words = part.trim();
    const tmux = TMUX_SESSION.exec(words);
    // tmux names can't hold `:` or `.`: after one comes a window or pane.
    if (tmux) return { kind: 'tmux', session: unquote(tmux[1]).replace(/^=|[:.].*$/g, '') };
    const zellij = ZELLIJ_SESSION.exec(words);
    if (zellij) return { kind: 'zellij', session: unquote(zellij[1] ?? zellij[2]) };
  }
  return null;
}

function unquote(word: string) {
  return word.replace(/^(['"])(.*)\1$/, '$2');
}
