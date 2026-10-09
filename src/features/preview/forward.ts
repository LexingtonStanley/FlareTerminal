import { ChannelOpenError, OPEN_FAILURE } from '@/features/ssh/client';
import type { Tunnel, TunnelEvents } from '@/features/terminal/transport';

/**
 * Local port forwarding, like `ssh -L`: a port on the phone (127.0.0.1 only) whose
 * connections each go through the session's SSH connection to a port on the host. The
 * preview's browser loads that local port.
 */

/** A connection accepted on the phone's port, from the preview's browser. */
export type LocalConnection = {
  write(bytes: Uint8Array): void;
  /** Closes once everything written has gone out: the host finished its answer. */
  end(): void;
  /** Closes now, dropping what hasn't gone out. */
  close(): void;
  /** Call once, straight away: bytes from the browser, and its end. */
  listen(events: TunnelEvents): void;
};

export type LocalServer = { port: number; close(): void };

/**
 * Listens on 127.0.0.1:`port`, or on any free port when that one is taken. Never on
 * other interfaces: the forwarded port would reach the host from the whole network.
 */
export type Listen = (
  port: number,
  onConnection: (connection: LocalConnection) => void
) => Promise<LocalServer>;

export type OpenTunnel = (events: TunnelEvents) => Promise<Tunnel>;

export type Forward = { localPort: number; stop(): void };

/**
 * Forwards connections to a local port through tunnels. `port` is the local port to try
 * first: the host's own, so pages that name their full address keep working. `onError`
 * hears why a tunnel couldn't open (the dev server stopped, the session dropped).
 */
export async function startForward({
  port,
  listen,
  openTunnel,
  onError,
}: {
  port: number;
  listen: Listen;
  openTunnel: OpenTunnel;
  onError?: (error: unknown) => void;
}): Promise<Forward> {
  const open = new Set<() => void>();
  let stopped = false;

  const server = await listen(port, (connection) => {
    let tunnel: Tunnel | null = null;
    let pending: Uint8Array[] = [];
    let closed = false;
    const close = (finished = false) => {
      if (closed) return;
      closed = true;
      open.delete(close);
      if (finished) connection.end();
      else connection.close();
      tunnel?.close();
    };
    if (stopped) return connection.close();
    open.add(close);

    connection.listen({
      onData: (bytes) => (tunnel ? tunnel.write(bytes) : pending.push(bytes)),
      onClose: () => close(),
    });
    openTunnel({
      onData: (bytes) => {
        if (!closed) connection.write(bytes);
      },
      // The dev server finished: the browser still gets the end of its answer.
      onClose: () => close(true),
    }).then(
      (opened) => {
        if (closed) return opened.close();
        tunnel = opened;
        pending.forEach((bytes) => opened.write(bytes));
        pending = [];
      },
      (error: unknown) => {
        onError?.(error);
        close();
      }
    );
  });

  return {
    localPort: server.port,
    stop() {
      stopped = true;
      server.close();
      [...open].forEach((close) => close());
    },
  };
}

/** What to tell the person when a tunnel to `port` on `host` (its name) won't open. */
export function tunnelErrorMessage(error: unknown, port: number, host: string): string {
  if (error instanceof ChannelOpenError) {
    if (error.reason === OPEN_FAILURE.CONNECT_FAILED) {
      return `Nothing is listening on port ${port} on ${host}. Start the dev server, then try again.`;
    }
    if (error.reason === OPEN_FAILURE.ADMINISTRATIVELY_PROHIBITED) {
      return `${host} doesn’t allow port forwarding. Set AllowTcpForwarding to yes in its sshd_config.`;
    }
  }
  if (error instanceof Error && error.message === 'Not connected') {
    return 'The session isn’t connected. Reconnect it, then try again.';
  }
  return error instanceof Error ? error.message : String(error);
}
