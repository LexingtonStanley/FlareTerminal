/**
 * A transport carries one terminal session between the app and a host. The terminal
 * view only renders; transports only move bytes. ttyd over WebSocket is the first
 * transport; SSH (native only) slots in behind the same interface.
 */

export type TerminalSize = { cols: number; rows: number };

export type SessionStatus =
  | { state: 'connecting' }
  | { state: 'connected' }
  /**
   * `message` explains why, for example the process exited or the host refused. `retry`
   * marks a network problem (the connection dropped, the host couldn't be reached) rather
   * than the session ending or being refused: worth reconnecting by itself.
   */
  | { state: 'closed'; message: string; retry?: boolean };

export type TransportListener = {
  /** Decoded terminal output, ready for the view. */
  onData(text: string): void;
  onTitle(title: string): void;
  onStatus(status: SessionStatus): void;
  /** 'secret' while the transport is reading a password typed into the terminal. */
  onInputMode?(mode: InputMode): void;
};

export type InputMode = 'normal' | 'secret';

/**
 * Bytes from the other end of a tunnel, and its end: it closed, or has nothing more to send.
 * A handler that throws closes that tunnel only.
 */
export type TunnelEvents = {
  onData(bytes: Uint8Array): void;
  onClose(): void;
};

/** `close()` ends the tunnel from this side; no events follow it. */
export type Tunnel = { write(bytes: Uint8Array): void; close(): void };

export interface TerminalTransport {
  /** Opens the session at the terminal's current size. Call once per transport. */
  connect(size: TerminalSize): void;
  /** Sends input. Dropped while not connected. */
  write(data: string): void;
  resize(size: TerminalSize): void;
  /** Closes without reporting a status change: the caller is already moving on. */
  close(): void;
  /**
   * Opens a byte stream to `port` on the host itself, alongside the terminal (SSH port
   * forwarding). Missing when the transport can't; rejects while it isn't connected.
   */
  openTunnel?(port: number, events: TunnelEvents): Promise<Tunnel>;
  /**
   * Runs `command` on the host alongside the terminal, without one (`ssh host command`):
   * its input and output as a tunnel, which ends when the command does. Missing when the
   * transport can't; rejects while it isn't connected.
   */
  runCommand?(command: string, events: TunnelEvents): Promise<Tunnel>;
  /**
   * The phone's network changed: checks the connection still works, and closes it as a
   * network failure (`retry`) if the host doesn't answer soon. Missing when the transport
   * can't ask (ttyd's protocol has no ping).
   */
  checkAlive?(): void;
}

/** A session that can't connect, and says why when it tries (a jump host was deleted). */
export function refusedTransport(message: string, listener: TransportListener): TerminalTransport {
  return {
    connect: () => listener.onStatus({ state: 'closed', message }),
    write: () => {},
    resize: () => {},
    close: () => {},
  };
}
