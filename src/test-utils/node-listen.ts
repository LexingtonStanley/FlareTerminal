// The preview's local port over node:net, so forwards run end to end in Jest (the app's
// version is react-native-tcp-socket). Use in files marked `@jest-environment node`.
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';

import type { Listen } from '@/features/preview/forward';

export const listenNode: Listen = async (port, onConnection) => {
  const server = createServer((socket) => {
    socket.on('error', () => {});
    onConnection({
      write: (bytes) => socket.write(bytes),
      close: () => socket.destroy(),
      listen: (events) => {
        socket.on('data', (data: Buffer) => events.onData(new Uint8Array(data)));
        socket.on('close', () => events.onClose());
      },
    });
  });
  const listen = async (at: number) => {
    server.listen(at, '127.0.0.1');
    await Promise.race([
      once(server, 'listening'),
      once(server, 'error').then(([error]) => Promise.reject(error)),
    ]);
  };
  await listen(port).catch(() => listen(0));
  return { port: (server.address() as AddressInfo).port, close: () => server.close() };
};
