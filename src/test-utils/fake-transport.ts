import type { Connection } from '@/features/connections/connections';
import type { KeyRequest } from '@/features/ssh/key-request';
import type { JumpHost } from '@/features/terminal/open-transport';
import type {
  InputMode,
  SessionStatus,
  TerminalSize,
  TerminalTransport,
  TransportListener,
  Tunnel,
  TunnelEvents,
} from '@/features/terminal/transport';

/** A tunnel the app opened, played from the host's side. */
export type FakeTunnel = { port: number; events: TunnelEvents; sent: string[]; closed: boolean };

/** A command the app ran beside the terminal, played from the host's side. */
export type FakeCommand = {
  command: string;
  events: TunnelEvents;
  /** What the app wrote, as text and as the bytes themselves (an image isn't text). */
  sent: string[];
  sentBytes: Uint8Array[];
  closed: boolean;
};

/**
 * Replaces src/features/terminal/open-transport.ts. Every transport the app opens is
 * recorded in `transports`, so a test can play the host:
 *
 *   jest.mock('@/features/terminal/open-transport', () => jest.requireActual('@/test-utils/fake-transport'));
 *   beforeEach(() => transports.splice(0));
 */
export class FakeTransport implements TerminalTransport {
  size: TerminalSize | null = null;
  written: string[] = [];
  resizes: TerminalSize[] = [];
  closed = false;
  tunnels: FakeTunnel[] = [];
  /** Set to make tunnels fail, as a host does when nothing listens on the port. */
  refuseTunnels: Error | null = null;
  commands: FakeCommand[] = [];
  /** Times it was asked to check the connection after a network change (SSH only). */
  checks = 0;
  checkAlive?: () => void;
  /** Like the real transports: SSH can forward ports and run commands, ttyd can't. */
  openTunnel?: (port: number, events: TunnelEvents) => Promise<Tunnel>;
  runCommand?: (command: string, events: TunnelEvents) => Promise<Tunnel>;

  constructor(
    readonly connection: Connection,
    readonly password: string | null,
    private readonly listener: TransportListener,
    /** The connections it goes through, the one reached directly first. */
    readonly jumps: JumpHost[] = []
  ) {
    if (connection.kind === 'ssh') {
      this.checkAlive = () => this.checks++;
      this.openTunnel = async (port, events) => {
        if (this.refuseTunnels) throw this.refuseTunnels;
        const tunnel: FakeTunnel = { port, events, sent: [], closed: false };
        this.tunnels.push(tunnel);
        return {
          write: (bytes) => tunnel.sent.push(new TextDecoder().decode(bytes)),
          close: () => (tunnel.closed = true),
        };
      };
      this.runCommand = async (command, events) => {
        const run: FakeCommand = { command, events, sent: [], sentBytes: [], closed: false };
        this.commands.push(run);
        return {
          write: (bytes) => {
            run.sent.push(new TextDecoder().decode(bytes));
            run.sentBytes.push(bytes);
          },
          close: () => (run.closed = true),
        };
      };
    }
  }

  connect(size: TerminalSize) {
    this.size = size;
    this.listener.onStatus({ state: 'connecting' });
  }
  write(data: string) {
    this.written.push(data);
  }
  resize(size: TerminalSize) {
    this.resizes.push(size);
  }
  close() {
    this.closed = true;
  }

  // Host side
  status(status: SessionStatus) {
    this.listener.onStatus(status);
  }
  output(text: string) {
    this.listener.onData(text);
  }
  title(title: string) {
    this.listener.onTitle(title);
  }
  /** The host asks for a password ('secret'), or stops asking ('normal'). */
  inputMode(mode: InputMode) {
    this.listener.onInputMode?.(mode);
  }
  /**
   * A program on the host asks to use a key (agent forwarding): the person's answer, and a
   * way to play the program giving up.
   */
  askForKey(request: KeyRequest): { answer: Promise<boolean>; giveUp(): void } {
    const controller = new AbortController();
    const answer = this.listener.onKeyRequest?.(request, controller.signal);
    if (!answer) throw new Error('Nothing listens for key requests');
    return { answer, giveUp: () => controller.abort() };
  }
}

export const transports: FakeTransport[] = [];

export function openTransport(
  connection: Connection,
  password: string | null,
  listener: TransportListener,
  jumps: JumpHost[] = []
) {
  const transport = new FakeTransport(connection, password, listener, jumps);
  transports.push(transport);
  return transport;
}
