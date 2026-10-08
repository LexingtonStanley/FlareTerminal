import TcpSocket from 'react-native-tcp-socket';

import type { ByteSocket } from './client';

/** Raw TCP for SSH on Android and iOS (react-native-tcp-socket). The web version refuses. */

export type SocketEvents = {
  onData(bytes: Uint8Array): void;
  onClose(error?: Error): void;
};

export type OpenSocket = (host: string, port: number, events: SocketEvents) => Promise<ByteSocket>;

const CONNECT_TIMEOUT_MS = 15_000;

export const openSocket: OpenSocket = (host, port, events) =>
  new Promise((resolve, reject) => {
    let connected = false;
    let lastError: Error | undefined;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${host}:${port}`));
    }, CONNECT_TIMEOUT_MS);

    const socket = TcpSocket.createConnection({ host, port }, () => {
      connected = true;
      clearTimeout(timer);
      // Interactive typing: send keystrokes at once rather than batching them.
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 30_000);
      resolve({ write: (bytes) => socket.write(bytes), close: () => socket.destroy() });
    });

    socket.on('data', (data) => {
      events.onData(
        typeof data === 'string'
          ? new TextEncoder().encode(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      );
    });
    socket.on('error', (error) => {
      lastError = error;
      if (!connected) {
        clearTimeout(timer);
        reject(error);
      }
    });
    socket.on('close', () => {
      if (connected) events.onClose(lastError);
    });
  });
