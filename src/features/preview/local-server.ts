import TcpSocket from 'react-native-tcp-socket';

import type { LocalConnection, LocalServer, Listen } from './forward';

/** The phone's end of a forward (react-native-tcp-socket). The web version refuses. */

function listenOn(
  port: number,
  onConnection: (connection: LocalConnection) => void
): Promise<LocalServer> {
  return new Promise((resolve, reject) => {
    const server = TcpSocket.createServer((socket) => {
      socket.setNoDelay(true);
      // Errors end in 'close', which closes the tunnel.
      socket.on('error', () => {});
      onConnection({
        write: (bytes) => socket.write(bytes),
        close: () => socket.destroy(),
        listen: (events) => {
          socket.on('data', (data) =>
            events.onData(
              typeof data === 'string'
                ? new TextEncoder().encode(data)
                : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            )
          );
          socket.on('close', () => events.onClose());
        },
      });
    });
    server.once('error', reject);
    // Loopback only: other devices on the network must not reach the host through it.
    server.listen({ port, host: '127.0.0.1' }, () => {
      server.off('error', reject);
      server.on('error', () => {});
      resolve({ port: server.address()?.port ?? port, close: () => server.close() });
    });
  });
}

export const listenLocal: Listen = (port, onConnection) =>
  listenOn(port, onConnection).catch(() => listenOn(0, onConnection));
