import {
  connectionLabel,
  type Connection,
  type SshConnection,
} from '@/features/connections/connections';
import { keysForConnection } from '@/features/ssh/keys';
import { knownHosts } from '@/features/ssh/known-hosts';
import { openSocket } from '@/features/ssh/socket';

import { SshTransport } from './ssh-transport';
import type { TerminalTransport, TransportListener } from './transport';
import { TtydTransport } from './ttyd';

/** A connection to go through (see jumpHosts), with its saved password. */
export type JumpHost = { connection: SshConnection; password: string | null };

/** The transport for a saved connection. Router tests replace this module with a fake. */
export function openTransport(
  connection: Connection,
  password: string | null,
  listener: TransportListener,
  jumps: JumpHost[] = []
): TerminalTransport {
  if (connection.kind === 'ssh') {
    return new SshTransport(
      {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password,
        userKeys: keysForConnection(connection.keyId),
        knownHosts,
        openSocket,
        jumps: jumps.map(({ connection: jump, password: jumpPassword }) => ({
          name: jump.name || connectionLabel(jump),
          host: jump.host,
          port: jump.port,
          username: jump.username,
          password: jumpPassword,
          userKeys: keysForConnection(jump.keyId),
        })),
      },
      listener
    );
  }
  const credentials = connection.username
    ? { username: connection.username, password: password ?? '' }
    : null;
  return new TtydTransport({ url: connection.url, credentials }, listener);
}
