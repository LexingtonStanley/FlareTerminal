import type { Connection } from '@/features/connections/connections';
import type {
  SessionStatus,
  TerminalSize,
  TerminalTransport,
  TransportListener,
  Tunnel,
  TunnelEvents,
} from '@/features/terminal/transport';

/** A tunnel the app opened, played from the host's side. */
export type FakeTunnel = { port: number; events: TunnelEvents; sent: string[]; closed: boolean };

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
  /** Like the real transports: SSH can forward ports, ttyd can't. */
  openTunnel?: (port: number, events: TunnelEvents) => Promise<Tunnel>;

  constructor(
    readonly connection: Connection,
    readonly password: string | null,
    private readonly listener: TransportListener
  ) {
    if (connection.kind === 'ssh') {
      this.openTunnel = async (port, events) => {
        if (this.refuseTunnels) throw this.refuseTunnels;
        const tunnel: FakeTunnel = { port, events, sent: [], closed: false };
        this.tunnels.push(tunnel);
        return {
          write: (bytes) => tunnel.sent.push(new TextDecoder().decode(bytes)),
          close: () => (tunnel.closed = true),
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
}

export const transports: FakeTransport[] = [];

export function openTransport(
  connection: Connection,
  password: string | null,
  listener: TransportListener
) {
  const transport = new FakeTransport(connection, password, listener);
  transports.push(transport);
  return transport;
}
