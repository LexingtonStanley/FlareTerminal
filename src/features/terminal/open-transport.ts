import type { Connection } from '@/features/connections/connections';
import { loadAppKey } from '@/features/ssh/app-key';
import { knownHosts } from '@/features/ssh/known-hosts';
import { openSocket } from '@/features/ssh/socket';

import { SshTransport } from './ssh-transport';
import type { TerminalTransport, TransportListener } from './transport';
import { TtydTransport } from './ttyd';

/** The transport for a saved connection. Router tests replace this module with a fake. */
export function openTransport(
  connection: Connection,
  password: string | null,
  listener: TransportListener
): TerminalTransport {
  if (connection.kind === 'ssh') {
    return new SshTransport(
      {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password,
        userKey: loadAppKey(),
        knownHosts,
        openSocket,
      },
      listener
    );
  }
  const credentials = connection.username
    ? { username: connection.username, password: password ?? '' }
    : null;
  return new TtydTransport({ url: connection.url, credentials }, listener);
}
