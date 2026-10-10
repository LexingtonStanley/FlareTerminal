import {
  EMPTY_CONNECTION_INPUT,
  validateConnection,
  type Connection,
  type ConnectionInput,
} from './connections';
import type { ConfigHost } from './ssh-config';

/** Why a host from a config starts unticked, or can't be added. */
export type ImportNote = 'saved' | 'jump' | 'local' | 'invalid';

export type ImportRow = { host: ConfigHost; note: ImportNote | null };

export const IMPORT_NOTES: Record<ImportNote, string> = {
  saved: 'Already saved',
  jump: 'Reached through another host, which Flare can’t do yet',
  local: 'Points at localhost, which from the phone is the phone',
  invalid: 'Flare can’t read its HostName',
};

const LOOPBACK = /^(localhost|.+\.localhost|127(\.\d+){3}|::1|0\.0\.0\.0)$/i;

/** A host from a config as the connection form's input. */
export function importInput(host: ConfigHost, user: string, groupId: string): ConnectionInput {
  return {
    ...EMPTY_CONNECTION_INPUT,
    name: host.alias,
    host: host.hostName,
    port: String(host.port),
    username: host.user ?? user.trim(),
    groupId,
  };
}

function noteFor(host: ConfigHost, connections: Connection[]): ImportNote | null {
  const { host: hostError, port: portError } = validateConnection(importInput(host, 'x', ''));
  if (hostError || portError) return 'invalid';
  const saved = connections.some(
    (connection) =>
      connection.kind === 'ssh' &&
      connection.host.toLowerCase() === host.hostName.toLowerCase() &&
      connection.port === host.port &&
      (host.user === null || connection.username === host.user)
  );
  if (saved) return 'saved';
  if (host.jump) return 'jump';
  if (LOOPBACK.test(host.hostName)) return 'local';
  return null;
}

/** The config's hosts, each with why it starts unticked, if it does. */
export function importRows(hosts: ConfigHost[], connections: Connection[]): ImportRow[] {
  return hosts.map((host) => ({ host, note: noteFor(host, connections) }));
}
