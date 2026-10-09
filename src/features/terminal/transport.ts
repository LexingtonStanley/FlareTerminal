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

export interface TerminalTransport {
  /** Opens the session at the terminal's current size. Call once per transport. */
  connect(size: TerminalSize): void;
  /** Sends input. Dropped while not connected. */
  write(data: string): void;
  resize(size: TerminalSize): void;
  /** Closes without reporting a status change: the caller is already moving on. */
  close(): void;
}
