import { toBase64 } from '@/features/ssh/bytes';
import {
  SshClient,
  type AuthPrompt,
  type HostKeyCheck,
  type SshChannel,
} from '@/features/ssh/client';
import { hostId, type KnownHosts } from '@/features/ssh/known-hosts';
import type { OpenSocket } from '@/features/ssh/socket';
import type { UserKey } from '@/features/ssh/user-key';

import type {
  TerminalSize,
  TerminalTransport,
  TransportListener,
  Tunnel,
  TunnelEvents,
} from './transport';

/**
 * A terminal session over SSH, like `ssh user@host`. Questions OpenSSH would ask (an
 * unknown host key, a password) are asked inside the terminal, and the answer is read
 * from what the person types there or in the composer.
 */

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
};

const KEY_NAMES: Record<string, string> = {
  'ssh-ed25519': 'ED25519',
  'ecdsa-sha2-nistp256': 'ECDSA',
  'ssh-rsa': 'RSA',
};

const RED = '\x1b[1;31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

type LineReader = { echo: boolean; line: string; resolve: (line: string | null) => void };

export class SshTransport implements TerminalTransport {
  private client: SshClient | null = null;
  private channel: SshChannel | null = null;
  private size: TerminalSize = { cols: 80, rows: 24 };
  private reader: LineReader | null = null;
  private closedByUs = false;
  private finished = false;
  private closeMessage: string | null = null;
  private readonly decoder = new TextDecoder();
  /** Ends each open tunnel; the client drops its channels silently with the connection. */
  private readonly tunnels = new Set<() => void>();

  constructor(
    private readonly options: SshTransportOptions,
    private readonly listener: TransportListener
  ) {}

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
    this.reader?.resolve(null);
    this.client?.close();
    this.endTunnels();
  }

  async openTunnel(port: number, events: TunnelEvents): Promise<Tunnel> {
    // Only once signed in: a shell channel means the session is up.
    if (!this.client || !this.channel || this.finished || this.closedByUs) {
      throw new Error('Not connected');
    }
    // "localhost" as the host resolves it: a dev server may listen on IPv4 or IPv6 only.
    const channel = await this.client.openDirectTcpip('localhost', port);
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
    // The dev server closed its connection (EOF), or the channel closed.
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

  private print(text: string) {
    this.listener.onData(text);
  }

  private finish(message: string, retry = false) {
    this.endTunnels();
    if (this.finished || this.closedByUs) return;
    this.finished = true;
    const closeMessage = this.closeMessage;
    this.listener.onStatus(
      closeMessage
        ? { state: 'closed', message: closeMessage }
        : { state: 'closed', message, ...(retry && { retry }) }
    );
  }

  private async run() {
    const { host, port, username, openSocket } = this.options;
    this.listener.onStatus({ state: 'connecting' });

    // Bytes can arrive before the client exists (the server speaks first).
    const early: Uint8Array[] = [];
    let earlyClose: { error?: Error } | null = null;
    let socket;
    try {
      socket = await openSocket(host, port, {
        onData: (bytes) => (this.client ? this.client.receive(bytes) : early.push(bytes)),
        onClose: (error) =>
          this.client ? this.client.socketClosed(error) : (earlyClose = { error }),
      });
    } catch (error) {
      this.finish(`Couldn't reach ${host}:${port}. ${(error as Error).message}`, true);
      return;
    }
    if (this.closedByUs) {
      socket.close();
      return;
    }

    const client = new SshClient(socket, {
      host,
      port,
      username,
      password: this.options.password,
      userKeys: this.options.userKeys,
      keepaliveInterval: this.options.keepaliveInterval,
      verifyHostKey: (check) => this.verifyHostKey(check),
      prompt: (request) => this.prompt(request),
      onBanner: (text) => this.print(text.replace(/\r?\n/g, '\r\n')),
      // Unclean: the socket dropped or the host stopped answering keepalives.
      onClose: (reason) => this.finish(reason.message, !reason.clean),
    });
    this.client = client;
    early.forEach((bytes) => client.receive(bytes));
    if (earlyClose) client.socketClosed((earlyClose as { error?: Error }).error);

    try {
      await client.handshake();
      await client.authenticate();
      const channel = await client.openShell({
        term: 'xterm-256color',
        cols: this.size.cols,
        rows: this.size.rows,
      });
      this.channel = channel;
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

  private async verifyHostKey({ key, fingerprint }: HostKeyCheck): Promise<boolean> {
    const { host, port, knownHosts } = this.options;
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
        "The host key changed. If you expected that, forget the saved host key in this connection's settings.";
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
        this.closeMessage = 'Host key not accepted';
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
