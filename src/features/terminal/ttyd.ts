import type {
  SessionStatus,
  TerminalSize,
  TerminalTransport,
  TransportListener,
} from './transport';

/**
 * Client for ttyd (https://github.com/tsl0922/ttyd, MIT), which shares a command
 * over WebSocket: `ttyd -W tmux new -A -s main`. Protocol, from ttyd 1.7's
 * src/protocol.c and its web client:
 *
 * - Socket at `<base URL>/ws` with subprotocol `tty`. Frames are a command byte and a
 *   payload; the server always sends binary frames.
 * - The client's first message is JSON without a command byte:
 *   `{"AuthToken": ..., "columns": ..., "rows": ...}`. ttyd starts the process only
 *   then, sized to match.
 * - Client to server: '0' input (ignored unless ttyd runs with -W), '1' resize JSON.
 * - Server to client: '0' output bytes, '1' window title, '2' preferences JSON.
 * - With `-c user:pass` the upgrade request needs `Authorization: Basic <base64>` and
 *   AuthToken must be that same base64 value. Browsers can't set WebSocket headers,
 *   so credentials only work from the native app.
 * - When the process exits ttyd closes the socket: 1000 for exit status 0, 1006
 *   otherwise. A wrong AuthToken closes with 1008.
 */

export const TTYD_SUBPROTOCOL = 'tty';
export const TTYD_DEFAULT_PORT = 7681;

const INPUT = '0';
const RESIZE = '1';
const OUTPUT = '0'.charCodeAt(0);
const SET_TITLE = '1'.charCodeAt(0);
// WebSocket.OPEN, without depending on the global (absent in some test environments).
const OPEN = 1;

export type TtydCredentials = { username: string; password: string };

/**
 * The WebSocket URL for what a person typed: `devbox:7681`, `http://10.0.0.5:7681`,
 * `https://devbox.example.ts.net/term/` or a `ws(s)://…/ws` URL. Query strings are kept
 * (ttyd's `-a` flag passes `?arg=` values to the command). Throws on anything else.
 */
export function ttydSocketUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);

  const schemes: Record<string, string> = {
    'http:': 'ws:',
    'https:': 'wss:',
    'ws:': 'ws:',
    'wss:': 'wss:',
  };
  const protocol = schemes[url.protocol];
  if (!protocol || !url.hostname) throw new Error('Use an http(s):// or ws(s):// address');
  if (url.username || url.password) {
    throw new Error('Put the username and password in their own fields');
  }

  const path = url.pathname.replace(/\/+$/, '');
  const socketPath = path.endsWith('/ws') ? path : `${path}/ws`;
  return `${protocol}//${url.host}${socketPath}${url.search}`;
}

/** True for addresses where an unencrypted ws:// connection stays on a private network. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  // Tailscale MagicDNS names and its CGNAT range (100.64.0.0/10) are WireGuard-encrypted.
  if (host.endsWith('.ts.net')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

/** ttyd's credential: base64 of `user:pass`, used for both the header and AuthToken. */
export function ttydCredential({ username, password }: TtydCredentials): string {
  return base64(new TextEncoder().encode(`${username}:${password}`));
}

function withCommand(command: string, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(payload.length + 1);
  frame[0] = command.charCodeAt(0);
  frame.set(payload, 1);
  return frame;
}

export function encodeHandshake(token: string, { cols, rows }: TerminalSize): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ AuthToken: token, columns: cols, rows }));
}

export function encodeInput(data: string): Uint8Array {
  return withCommand(INPUT, new TextEncoder().encode(data));
}

export function encodeResize({ cols, rows }: TerminalSize): Uint8Array {
  return withCommand(RESIZE, new TextEncoder().encode(JSON.stringify({ columns: cols, rows })));
}

export type TtydServerMessage =
  { type: 'output'; data: Uint8Array } | { type: 'title'; title: string } | { type: 'other' };

export function decodeServerMessage(data: ArrayBuffer | string): TtydServerMessage {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  if (bytes.length === 0) return { type: 'other' };
  const payload = bytes.subarray(1);
  switch (bytes[0]) {
    case OUTPUT:
      return { type: 'output', data: payload };
    case SET_TITLE:
      return { type: 'title', title: new TextDecoder().decode(payload) };
    default:
      // '2' preferences: ttyd's client settings (font, renderer). Not used here.
      return { type: 'other' };
  }
}

/** Why a socket closed, in words for the status banner. */
export function describeClose(code: number, opened: boolean, url: string): string {
  if (!opened) return `Couldn't connect to ${url}`;
  if (code === 1000) return 'Session ended';
  if (code === 1008) return 'The host rejected the username or password';
  // ttyd uses 1006 when the process exits with a non-zero status, which is also what
  // a dropped network connection looks like.
  if (code === 1006) return 'Session ended or connection lost';
  return `Connection closed (code ${code})`;
}

/** React Native's WebSocket takes a third argument with headers; browsers don't. */
type WebSocketWithHeaders = new (
  url: string,
  protocols: string[],
  options?: { headers: Record<string, string> }
) => WebSocket;

export type CreateSocket = (
  url: string,
  protocols: string[],
  headers: Record<string, string>
) => WebSocket;

const createWebSocket: CreateSocket = (url, protocols, headers) =>
  new (WebSocket as unknown as WebSocketWithHeaders)(url, protocols, { headers });

export type TtydTransportOptions = {
  /** Anything ttydSocketUrl accepts. */
  url: string;
  credentials?: TtydCredentials | null;
  /** Injected in tests. */
  createSocket?: CreateSocket;
};

export class TtydTransport implements TerminalTransport {
  private socket: WebSocket | null = null;
  private opened = false;
  private closedByUs = false;
  private size: TerminalSize = { cols: 80, rows: 24 };
  private readonly decoder = new TextDecoder();

  constructor(
    private readonly options: TtydTransportOptions,
    private readonly listener: TransportListener
  ) {}

  connect(size: TerminalSize) {
    if (this.socket) throw new Error('TtydTransport.connect() can only be called once');
    this.size = size;
    this.setStatus({ state: 'connecting' });

    let url: string;
    try {
      url = ttydSocketUrl(this.options.url);
    } catch (error) {
      this.setStatus({ state: 'closed', message: (error as Error).message });
      return;
    }

    const { credentials, createSocket = createWebSocket } = this.options;
    const token = credentials ? ttydCredential(credentials) : '';
    const headers: Record<string, string> = token ? { Authorization: `Basic ${token}` } : {};
    const socket = createSocket(url, [TTYD_SUBPROTOCOL], headers);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      this.opened = true;
      socket.send(encodeHandshake(token, this.size));
      this.setStatus({ state: 'connected' });
    };
    socket.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      const message = decodeServerMessage(event.data);
      if (message.type === 'output') {
        const text = this.decoder.decode(message.data, { stream: true });
        if (text) this.listener.onData(text);
      } else if (message.type === 'title') {
        this.listener.onTitle(message.title);
      }
    };
    socket.onclose = (event: CloseEvent) => {
      this.setStatus({ state: 'closed', message: describeClose(event.code, this.opened, url) });
    };
    // An error is always followed by close, which reports it.
    socket.onerror = () => {};
  }

  write(data: string) {
    if (this.socket?.readyState === OPEN) this.socket.send(encodeInput(data));
  }

  resize(size: TerminalSize) {
    this.size = size;
    if (this.socket?.readyState === OPEN) this.socket.send(encodeResize(size));
  }

  close() {
    this.closedByUs = true;
    this.socket?.close(1000);
  }

  private setStatus(status: SessionStatus) {
    if (!this.closedByUs) this.listener.onStatus(status);
  }
}
