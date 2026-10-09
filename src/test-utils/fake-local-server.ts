import type { Listen, LocalConnection } from '@/features/preview/forward';
import type { TunnelEvents } from '@/features/terminal/transport';

/**
 * Replaces src/features/preview/local-server.ts. Each port the app listens on is recorded
 * in `localServers`, and `connect()` plays the preview's browser opening a connection:
 *
 *   jest.mock('@/features/preview/local-server', () => jest.requireActual('@/test-utils/fake-local-server'));
 *   beforeEach(() => localServers.splice(0));
 */
export type FakeLocalServer = {
  /** The port asked for; it is also the port given. */
  port: number;
  closed: boolean;
  /** `ended`: closed after everything written went out, rather than dropped. */
  connect(): { events: TunnelEvents; received: string[]; closed: boolean; ended: boolean };
};

export const localServers: FakeLocalServer[] = [];

export const listenLocal: Listen = async (port, onConnection) => {
  const server: FakeLocalServer = {
    port,
    closed: false,
    connect() {
      const browser = {
        events: null as unknown as TunnelEvents,
        received: [] as string[],
        closed: false,
        ended: false,
      };
      const connection: LocalConnection = {
        write: (bytes) => browser.received.push(new TextDecoder().decode(bytes)),
        end: () => (browser.closed = browser.ended = true),
        close: () => (browser.closed = true),
        listen: (events) => (browser.events = events),
      };
      onConnection(connection);
      return browser;
    },
  };
  localServers.push(server);
  return { port, close: () => (server.closed = true) };
};
