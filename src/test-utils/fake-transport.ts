import type { Connection } from '@/features/connections/connections';
import type {
  SessionStatus,
  TerminalSize,
  TerminalTransport,
  TransportListener,
} from '@/features/terminal/transport';

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

  constructor(
    readonly connection: Connection,
    readonly password: string | null,
    private readonly listener: TransportListener
  ) {}

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
