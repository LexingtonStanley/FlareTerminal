import type { Page, WebSocketRoute } from '@playwright/test';

/**
 * A ttyd stand-in for the web E2E tests, wired in with page.routeWebSocket so nothing
 * listens on the network. It speaks ttyd's framing (see src/features/terminal/ttyd.ts)
 * and runs a tiny line-editing "shell": it echoes keystrokes, understands `echo`,
 * Ctrl+C, backspace and the Left and Right arrows (typing goes in at the cursor, like
 * readline), ignores other escape sequences, and turns on bracketed paste like bash does.
 */

export const FAKE_TTYD_ADDRESS = 'ttyd.test:7681';
const SOCKET_URL = `ws://${FAKE_TTYD_ADDRESS}/ws`;

export const FAKE_TITLE = 'fake-shell (ttyd.test)';
const PROMPT = '\x1b[?2004h$ ';
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
/** An escape sequence (arrows in either cursor mode, CSI sequences) or one character. */
const TOKEN = /\x1b\[[0-9;]*[@-~]|\x1bO[@-~]|\x1b|[\s\S]/gu;

type Handshake = { AuthToken: string; columns: number; rows: number };

export type FakeTtydSession = {
  handshake: Handshake;
  /** Every input frame's payload, in order. */
  inputs: string[];
  resizes: { columns: number; rows: number }[];
  /** Sends raw output to the terminal. */
  output(text: string): void;
  /** Ends the session the way ttyd does when the process exits. */
  exit(code?: number): void;
};

export type FakeTtyd = {
  /** Resolves with the nth session (0-based) once its handshake has arrived. */
  session(index: number): Promise<FakeTtydSession>;
};

type ShellSession = FakeTtydSession & { handleInput(data: string): void };

const frame = (command: string, text: string) =>
  Buffer.concat([Buffer.from(command), Buffer.from(text, 'utf8')]);

function run(command: string) {
  const [name, ...args] = command.trim().split(/\s+/);
  if (!name) return '';
  if (name === 'echo') return args.join(' ') + '\r\n';
  return `fake-shell: ${name}: command not found\r\n`;
}

function startShell(ws: WebSocketRoute, handshake: Handshake): ShellSession {
  let line = '';
  let cursor = 0;
  const session: ShellSession = {
    handshake,
    inputs: [],
    resizes: [],
    output: (text) => ws.send(frame('0', text)),
    exit: (code = 1000) => ws.close({ code }),
    handleInput,
  };

  function handleInput(data: string) {
    session.inputs.push(data);
    const text = data.split(PASTE_START).join('').split(PASTE_END).join('');
    let echo = '';
    for (const token of text.match(TOKEN) ?? []) {
      const rest = line.slice(cursor);
      if (token === '\r') {
        echo += '\r\n' + run(line) + PROMPT;
        line = '';
        cursor = 0;
      } else if (token === '\x03') {
        echo += '^C\r\n' + PROMPT;
        line = '';
        cursor = 0;
      } else if (token === '\x7f') {
        if (cursor === 0) continue;
        line = line.slice(0, cursor - 1) + rest;
        cursor--;
        echo += '\b' + rest + ' ' + '\b'.repeat(rest.length + 1);
      } else if (token === '\x1b[D' || token === '\x1bOD') {
        if (cursor === 0) continue;
        cursor--;
        echo += '\b';
      } else if (token === '\x1b[C' || token === '\x1bOC') {
        if (cursor === line.length) continue;
        echo += line[cursor];
        cursor++;
      } else if (token >= ' ' && !token.startsWith('\x1b')) {
        line = line.slice(0, cursor) + token + rest;
        cursor++;
        echo += token + rest + '\b'.repeat(rest.length);
      }
    }
    if (echo) session.output(echo);
  }

  ws.send(frame('1', FAKE_TITLE));
  ws.send(frame('2', '{}'));
  session.output(PROMPT);
  return session;
}

export async function fakeTtyd(page: Page): Promise<FakeTtyd> {
  const sessions: ShellSession[] = [];
  const waiting = new Map<number, (session: FakeTtydSession) => void>();

  await page.routeWebSocket(SOCKET_URL, (ws) => {
    let session: ShellSession | null = null;

    ws.onMessage((message) => {
      const bytes = typeof message === 'string' ? Buffer.from(message) : message;
      if (!session) {
        // ttyd's first message is the handshake JSON, without a command byte.
        session = startShell(ws, JSON.parse(bytes.toString('utf8')));
        sessions.push(session);
        waiting.get(sessions.length - 1)?.(session);
        return;
      }
      const payload = bytes.subarray(1).toString('utf8');
      if (bytes[0] === '0'.charCodeAt(0)) session.handleInput(payload);
      else if (bytes[0] === '1'.charCodeAt(0)) session.resizes.push(JSON.parse(payload));
    });
  });

  return {
    session: (index) =>
      sessions[index]
        ? Promise.resolve(sessions[index])
        : new Promise((resolve) => waiting.set(index, resolve)),
  };
}
