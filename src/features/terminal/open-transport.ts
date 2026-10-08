import type { Connection } from '@/features/connections/connections';

import type { TerminalTransport, TransportListener } from './transport';
import { TtydTransport } from './ttyd';

/** The transport for a saved connection. Router tests replace this module with a fake. */
export function openTransport(
  connection: Connection,
  password: string | null,
  listener: TransportListener
): TerminalTransport {
  const credentials = connection.username
    ? { username: connection.username, password: password ?? '' }
    : null;
  return new TtydTransport({ url: connection.url, credentials }, listener);
}
