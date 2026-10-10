import { AgentConnection, type AgentBackend } from '@/features/ssh/agent';
import { toBase64 } from '@/features/ssh/bytes';
import {
  ChannelOpenError,
  OPEN_FAILURE,
  SshClient,
  type AuthPrompt,
  type ByteSocket,
  type HostKeyCheck,
  type SshChannel,
} from '@/features/ssh/client';
import { hostId, type KnownHosts } from '@/features/ssh/known-hosts';
import type { OpenSocket, SocketEvents } from '@/features/ssh/socket';
import type { UserKey } from '@/features/ssh/user-key';

import type {
  TerminalSize,
  TerminalTransport,
  TransportListener,
  Tunnel,
  TunnelEvents,
} from './transport';

/**
 * A terminal session over SSH, like `ssh user@host`, or `ssh -J` through jump hosts.
 * Questions OpenSSH would ask (an unknown host key, a password) are asked inside the
 * terminal, and the answer is read from what the person types there or in the composer.
 */

/**
 * A computer to go through first (`ssh -J`, ProxyJump). The phone signs in to it, then
 * opens a forwarded channel from it to the next one and speaks SSH to that over the
 * channel: a jump host only relays encrypted bytes, and keys never leave the phone.
 */
export type SshJump = {
  /** What the person calls it, in messages about it. */
  name: string;
  host: string;
  port: number;
  username: string;
  password: string | null;
  userKeys: UserKey[];
};

export type SshTransportOptions = {
  host: string;
  port: number;
  username: string;
  /** A saved password, tried once before asking. */
  password: string | null;
  /** Keys to offer before a password, in order. */
  userKeys: UserKey[];
  knownHosts: KnownHosts;
  openSocket: OpenSocket;
  /** Seconds between keepalives; 0 turns them off (tests). */
  keepaliveInterval?: number;
  /** Computers to go through, the one reached directly first. */
  jumps?: SshJump[];
  /**
   * Forwards this agent to the host, like `ssh -A` (never to jump hosts): programs there can
   * ask it to sign with the person's keys.
   */
  agent?: AgentBackend;
};

/** One computer on the way: a jump host, named, or the host itself (name null). */
type Hop = { name: string | null; host: string; port: number; username: string };

type Credentials = Pick<SshTransportOptions, 'password' | 'userKeys'>;

const KEY_NAMES: Record<string, string> = {
  'ssh-ed25519': 'ED25519',
  'ecdsa-sha2-nistp256': 'ECDSA',
  'ssh-rsa': 'RSA',
};

/** How long the host has to answer after the phone changes network (cellular can be slow). */
export const NETWORK_CHECK_MS = 10_000;

const RED = '\x1b[1;31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

type LineReader = { echo: boolean; line: string; resolve: (line: string | null) => void };

/**
 * A forwarded channel through `client` to `host`:`port`, as the socket for the next
 * connection. The far end closing (EOF) ends it like a TCP socket closing.
 */
async function forwardedSocket(
  client: SshClient,
  host: string,
  port: number,
  events: SocketEvents
): Promise<ByteSocket> {
  const channel = await client.openDirectTcpip(host, port);
  let open = true;
  const closed = () => {
    if (!open) return;
    open = false;
    events.onClose();
  };
  channel.onData = (bytes) => events.onData(bytes);
  channel.onEof = closed;
  channel.onClose = closed;
  return {
    write: (bytes) => channel.write(bytes),
    close: () => {
      open = false;
      channel.close();
    },
  };
}

export class SshTransport implements TerminalTransport {
  private client: SshClient | null = null;
  /** The jump hosts' connections, in order, once each is open. */
  private readonly jumpClients: SshClient[] = [];
  private channel: SshChannel | null = null;
  private size: TerminalSize = { cols: 80, rows: 24 };
  private reader: LineReader | null = null;
  private closedByUs = false;
  private finished = false;
  private closeMessage: string | null = null;
  private readonly decoder = new TextDecoder();
  /** Ends each tunnel and command; the client drops channels silently with the connection. */
  private readonly tunnels = new Set<() => void>();
  /** Programs' connections to the forwarded agent, closed with the session. */
  private readonly agents = new Set<AgentConnection>();

  private readonly options: Omit<SshTransportOptions, 'password' | 'userKeys' | 'jumps'>;
  private readonly jumps: Hop[];
  /**
   * Each jump host's, then the host's. Handed to each client to sign in, then dropped: an
   * open session doesn't keep them.
   */
  private credentials: (Credentials | null)[] | null;

  constructor(
    { password, userKeys, jumps = [], ...options }: SshTransportOptions,
    private readonly listener: TransportListener
  ) {
    this.options = options;
    this.jumps = jumps.map(({ name, host, port, username }) => ({ name, host, port, username }));
    this.credentials = [
      ...jumps.map((jump) => ({ password: jump.password, userKeys: jump.userKeys })),
      { password, userKeys },
    ];
  }

  connect(size: TerminalSize) {
    this.size = size;
    void this.run();
  }

  write(data: string) {
    if (this.reader) this.readLine(data);
    else this.channel?.write(new TextEncoder().encode(data));
  }

  resize(size: TerminalSize) {
    this.size = size;
    this.channel?.resize(size.cols, size.rows);
  }

  close() {
    this.closedByUs = true;
    this.credentials = null;
    this.reader?.resolve(null);
    this.closeClients();
    this.endTunnels();
    this.closeAgents();
  }

  checkAlive() {
    if (this.channel && !this.finished && !this.closedByUs) {
      // Any of them may have been on the old network.
      [...this.jumpClients, this.client].forEach((client) => client?.checkAlive(NETWORK_CHECK_MS));
    }
  }

  async openTunnel(port: number, events: TunnelEvents): Promise<Tunnel> {
    const client = this.connectedClient();
    // "localhost" as the host resolves it: a dev server may listen on IPv4 or IPv6 only.
    return this.track(await client.openDirectTcpip('localhost', port), events);
  }

  async runCommand(command: string, events: TunnelEvents): Promise<Tunnel> {
    return this.track(await this.connectedClient().openExec(command), events);
  }

  /** Only once signed in: a shell channel means the session is up. */
  private connectedClient(): SshClient {
    if (!this.client || !this.channel || this.finished || this.closedByUs) {
      throw new Error('Not connected');
    }
    return this.client;
  }

  /** A channel beside the shell as a Tunnel, ended with the connection. */
  private track(channel: SshChannel, events: TunnelEvents): Tunnel {
    // The connection can end while the channel opens.
    if (this.finished || this.closedByUs || channel.closed) {
      channel.close();
      throw new Error('Not connected');
    }
    const end = () => {
      if (!this.tunnels.delete(end)) return;
      events.onClose();
    };
    this.tunnels.add(end);
    channel.onData = (bytes) => {
      if (!this.tunnels.has(end)) return;
      try {
        events.onData(bytes);
      } catch {
        // A tunnel whose other end failed closes alone, never the whole connection.
        channel.close();
        end();
      }
    };
    // The other end finished (EOF: a dev server closed its connection, a command ended),
    // or the channel closed.
    channel.onEof = end;
    channel.onClose = end;
    return {
      write: (bytes) => channel.write(bytes),
      close: () => {
        this.tunnels.delete(end);
        channel.close();
      },
    };
  }

  private endTunnels() {
    [...this.tunnels].forEach((end) => end());
  }

  /** A program on the host connected to the forwarded agent. */
  private serveAgent(client: SshClient, channel: SshChannel) {
    const { agent } = this.options;
    const session = client.session;
    if (!agent || !session || this.finished || this.closedByUs) {
      channel.close();
      return;
    }
    const connection = new AgentConnection(
      (bytes) => channel.write(bytes),
      agent,
      session,
      () => channel.close()
    );
    this.agents.add(connection);
    const end = () => {
      connection.close();
      this.agents.delete(connection);
    };
    channel.onData = (bytes) => connection.receive(bytes);
    // The program closed its end; requests it left waiting no longer need an answer.
    channel.onEof = () => {
      end();
      channel.close();
    };
    channel.onClose = end;
  }

  private closeAgents() {
    this.agents.forEach((connection) => connection.close());
    this.agents.clear();
  }

  private print(text: string) {
    this.listener.onData(text);
  }

  private finish(message: string, retry = false) {
    this.endTunnels();
    this.closeAgents();
    this.credentials = null;
    if (this.finished || this.closedByUs) return;
    this.finished = true;
    const closeMessage = this.closeMessage;
    this.listener.onStatus(
      closeMessage
        ? { state: 'closed', message: closeMessage }
        : { state: 'closed', message, ...(retry && { retry }) }
    );
    // With jump hosts, one connection ending ends the others.
    this.closeClients();
  }

  /** The host's connection first, so its goodbye can still get through the jump hosts. */
  private closeClients() {
    [this.client, ...[...this.jumpClients].reverse()].forEach((client) => client?.close());
  }

  private async run() {
    const { host, port, username } = this.options;
    this.listener.onStatus({ state: 'connecting' });
    let openSocket = this.options.openSocket;
    let via: Hop | null = null;
    for (const [index, jump] of this.jumps.entries()) {
      const jumpClient = await this.signIn(jump, index, openSocket, via);
      if (!jumpClient) return;
      openSocket = (to, toPort, events) => forwardedSocket(jumpClient, to, toPort, events);
      via = jump;
    }

    const hop: Hop = { name: null, host, port, username };
    const client = await this.signIn(hop, this.jumps.length, openSocket, via);
    if (!client) return;

    try {
      const channel = await client.openShell({
        term: 'xterm-256color',
        cols: this.size.cols,
        rows: this.size.rows,
        forwardAgent: !!this.options.agent,
      });
      this.channel = channel;
      if (client.agentForwarding === false) {
        this.print(
          `${DIM}This computer's SSH server doesn't allow agent forwarding (AllowAgentForwarding), so commands here can't use your keys.${RESET}\r\n`
        );
      }
      channel.onData = (bytes) => {
        const text = this.decoder.decode(bytes, { stream: true });
        if (text) this.listener.onData(text);
      };
      channel.onClose = ({ exitStatus, exitSignal }) => {
        this.finish(
          exitSignal
            ? `Session ended (signal ${exitSignal})`
            : exitStatus
              ? `Session ended (exit status ${exitStatus})`
              : 'Session ended'
        );
        client.close();
      };
      this.listener.onTitle(`${username}@${host}`);
      this.listener.onStatus({ state: 'connected' });
    } catch (error) {
      this.finish((error as Error).message);
      client.close();
    }
  }

  /**
   * Connects to `hop` with `openSocket` (straight there, or through the jump host `via`),
   * checks its host key and signs in with credentials `index`. Null when that failed,
   * having said why.
   */
  private async signIn(
    hop: Hop,
    index: number,
    openSocket: OpenSocket,
    via: Hop | null
  ): Promise<SshClient | null> {
    const { host, port, username, name } = hop;
    // Messages about a jump host name it; the host's are the session's own.
    const about = (message: string) => (name !== null ? `${name}: ${message}` : message);

    // Bytes can arrive before the client exists (the server speaks first).
    let client: SshClient | null = null;
    const early: Uint8Array[] = [];
    let earlyClose: { error?: Error } | null = null;
    let socket;
    try {
      socket = await openSocket(host, port, {
        onData: (bytes) => (client ? client.receive(bytes) : early.push(bytes)),
        onClose: (error) => (client ? client.socketClosed(error) : (earlyClose = { error })),
      });
    } catch (error) {
      if (via) this.unreachableThrough(via, hop, error);
      else this.finish(about(`Couldn't reach ${host}:${port}. ${(error as Error).message}`), true);
      return null;
    }
    if (this.closedByUs || this.finished) {
      socket.close();
      return null;
    }

    const credentials = this.credentials?.[index];
    // The client drops them once signed in; so does the session, as each one goes.
    if (this.credentials) this.credentials[index] = null;
    if (!this.credentials?.some(Boolean)) this.credentials = null;
    const opened = new SshClient(socket, {
      host,
      port,
      username,
      password: credentials?.password,
      userKeys: credentials?.userKeys,
      keepaliveInterval: this.options.keepaliveInterval,
      verifyHostKey: (check) => this.verifyHostKey(check, hop),
      prompt: (request) => this.prompt(request),
      onBanner: (text) => this.print(text.replace(/\r?\n/g, '\r\n')),
      // Unclean: the socket dropped or the host stopped answering keepalives.
      onClose: (reason) => this.finish(about(reason.message), !reason.clean),
      // Only to the host itself, as `ssh -J` does: jump hosts just relay.
      onAgentChannel:
        name === null && this.options.agent
          ? (channel) => this.serveAgent(opened, channel)
          : undefined,
    });
    client = opened;
    if (name !== null) this.jumpClients.push(opened);
    else this.client = opened;
    early.forEach((bytes) => opened.receive(bytes));
    if (earlyClose) opened.socketClosed((earlyClose as { error?: Error }).error);

    try {
      await opened.handshake();
      await opened.authenticate();
      return opened;
    } catch (error) {
      this.finish(about((error as Error).message));
      opened.close();
      return null;
    }
  }

  /** The jump host `via` couldn't open a channel on to `hop`. */
  private unreachableThrough(via: Hop, hop: Hop, error: unknown) {
    const target = `${hop.host}:${hop.port}`;
    if (!(error instanceof ChannelOpenError)) {
      this.finish(`${via.name}: ${(error as Error).message}`, true);
    } else if (error.reason === OPEN_FAILURE.ADMINISTRATIVELY_PROHIBITED) {
      this.finish(
        `${via.name} won't forward the connection to ${target}: its SSH server has forwarding turned off (AllowTcpForwarding).`
      );
    } else {
      const reason = error.description ? ` ${error.description}` : '';
      this.finish(`${via.name} couldn't reach ${target}.${reason}`, true);
    }
  }

  private async verifyHostKey({ key, fingerprint }: HostKeyCheck, hop: Hop): Promise<boolean> {
    const { knownHosts } = this.options;
    const { host, port, name } = hop;
    const blob = toBase64(key.blob);
    const known = knownHosts.get(host, port);
    const keyName = KEY_NAMES[key.type] ?? key.type;

    if (known) {
      if (known.key === blob) return true;
      this.print(
        `${RED}WARNING: THE HOST KEY FOR ${hostId(host, port).toUpperCase()} HAS CHANGED!${RESET}\r\n` +
          `Someone could be intercepting this connection, or the computer was reinstalled.\r\n` +
          `Expected ${known.fingerprint}\r\n` +
          `Received ${fingerprint}\r\n`
      );
      this.closeMessage =
        name !== null
          ? `${name}'s host key changed. If you expected that, forget the saved host key in ${name}'s settings.`
          : "The host key changed. If you expected that, forget the saved host key in this connection's settings.";
      return false;
    }

    this.print(
      `The authenticity of host '${hostId(host, port)}' can't be established.\r\n` +
        `${keyName} key fingerprint is ${fingerprint}.\r\n`
    );
    let question = 'Are you sure you want to continue connecting (yes/no)? ';
    for (;;) {
      const answer = (await this.ask(question, true))?.trim();
      if (answer === undefined || answer.toLowerCase() === 'no') {
        this.closeMessage =
          name !== null ? `${name}'s host key not accepted` : 'Host key not accepted';
        return false;
      }
      if (answer.toLowerCase() === 'yes' || answer === fingerprint) break;
      question = "Please type 'yes' or 'no': ";
    }
    knownHosts.trust(host, port, {
      type: key.type,
      key: blob,
      fingerprint,
      addedAt: new Date().toISOString(),
    });
    this.print(
      `${DIM}Permanently added '${hostId(host, port)}' (${keyName}) to the list of known hosts.${RESET}\r\n`
    );
    return true;
  }

  private async prompt({ name, instruction, prompts }: AuthPrompt): Promise<string[] | null> {
    if (name) this.print(`${name}\r\n`);
    if (instruction) this.print(`${instruction.replace(/\r?\n/g, '\r\n')}\r\n`);
    const answers: string[] = [];
    for (const { prompt, echo } of prompts) {
      const answer = await this.ask(prompt, echo);
      if (answer === null) return null;
      answers.push(answer);
    }
    return answers;
  }

  /** Prints a question and reads one line typed into the terminal. Ctrl+C gives up. */
  private ask(question: string, echo: boolean): Promise<string | null> {
    this.print(question);
    this.listener.onInputMode?.(echo ? 'normal' : 'secret');
    return new Promise((resolve) => {
      this.reader = {
        echo,
        line: '',
        resolve: (line) => {
          this.reader = null;
          this.listener.onInputMode?.('normal');
          resolve(line);
        },
      };
    });
  }

  private readLine(data: string) {
    const reader = this.reader!;
    // Composer text arrives as a bracketed paste when the terminal had it switched on.
    const text = data.replace(/\x1b\[20[01]~/g, '');
    let echo = '';
    for (const char of text) {
      if (char === '\r' || char === '\n') {
        this.print(echo + '\r\n');
        reader.resolve(reader.line);
        return;
      }
      if (char === '\x03') {
        this.print(echo + '^C\r\n');
        reader.resolve(null);
        return;
      }
      if (char === '\x7f' || char === '\b') {
        if (reader.line && reader.echo) echo += '\b \b';
        reader.line = [...reader.line].slice(0, -1).join('');
      } else if (char === '\x15') {
        if (reader.echo) echo += '\b \b'.repeat([...reader.line].length);
        reader.line = '';
      } else if (char >= ' ') {
        reader.line += char;
        if (reader.echo) echo += char;
      }
    }
    if (echo) this.print(echo);
  }
}
