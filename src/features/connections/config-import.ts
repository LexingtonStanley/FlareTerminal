import {
  EMPTY_CONNECTION_INPUT,
  newConnectionId,
  parseSshTarget,
  toConnection,
  validateConnection,
  type Connection,
  type ConnectionInput,
} from './connections';
import type { ConfigHost } from './ssh-config';

/** Why a host from a config starts unticked, or can't be added. */
export type ImportNote = 'saved' | 'local' | 'invalid' | 'command' | 'chain' | 'jump';

export type ImportRow = {
  host: ConfigHost;
  note: ImportNote | null;
  /**
   * What its ProxyJump names (a saved connection's name, an alias here, or as written), for
   * its caption. Null when it is reached directly.
   */
  via: string | null;
  /** The jump host it would go through: a saved connection, or a host in this list. */
  jump: { connectionId: string } | { alias: string } | null;
};

/** What a row's caption says about it, after its address. */
export function importNote({ note, via }: ImportRow): string | null {
  switch (note) {
    case 'saved':
      return 'Already saved';
    case 'local':
      return 'Points at localhost, which from the phone is the phone';
    case 'invalid':
      return 'Flare can’t read its HostName';
    case 'command':
      return 'Reached with a ProxyCommand, which Flare can’t run';
    case 'chain':
      return 'Its ProxyJump lists several hosts, which Flare can’t import yet';
    case 'jump':
      return `Reached through ${via}, which isn’t saved or here to add`;
    case null:
      return via ? `Through ${via}` : null;
  }
}

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

/** A saved SSH connection to the same computer as `user@hostName:port` (any user when null). */
function savedAs(
  { hostName, port, user }: Pick<ConfigHost, 'hostName' | 'port' | 'user'>,
  connections: Connection[]
): Connection | undefined {
  return connections.find(
    (connection) =>
      connection.kind === 'ssh' &&
      connection.host.toLowerCase() === hostName.toLowerCase() &&
      connection.port === port &&
      (user === null || connection.username === user)
  );
}

/**
 * The config's hosts, each with why it starts unticked, if it does, and the jump host it
 * goes through. A ProxyJump may name a saved connection, or another host in the list,
 * which is then added with it.
 */
export function importRows(hosts: ConfigHost[], connections: Connection[]): ImportRow[] {
  const byAlias = new Map(hosts.map((host) => [host.alias.toLowerCase(), host]));
  const rows = new Map<ConfigHost, ImportRow>();
  const resolving = new Set<ConfigHost>();

  function rowFor(host: ConfigHost): ImportRow {
    const known = rows.get(host);
    if (known) return known;
    // Hosts that jump through each other in a circle can't be reached.
    if (resolving.has(host)) return { host, note: 'jump', via: host.alias, jump: null };
    resolving.add(host);
    const row = resolve(host);
    resolving.delete(host);
    rows.set(host, row);
    return row;
  }

  function resolve(host: ConfigHost): ImportRow {
    const direct = { host, via: null, jump: null };
    const { host: hostError, port: portError } = validateConnection(importInput(host, 'x', ''));
    if (hostError || portError) return { ...direct, note: 'invalid' };
    if (savedAs(host, connections)) return { ...direct, note: 'saved' };
    if (host.proxyCommand) return { ...direct, note: 'command' };
    if (!host.proxyJump) {
      return { ...direct, note: LOOPBACK.test(host.hostName) ? 'local' : null };
    }
    // From the jump host, localhost is the jump host: nothing to warn about.
    const via = host.proxyJump;
    if (via.includes(',')) return { host, note: 'chain', via, jump: null };
    const target = parseSshTarget(via.replace(/^ssh:\/\//i, ''));

    // `ProxyJump bastion` names another host here, read with its own settings.
    const named = byAlias.get(target.host.toLowerCase());
    if (
      named &&
      (target.username === undefined || target.username === named.user) &&
      (target.port === undefined || target.port === named.port)
    ) {
      const saved = savedAs(named, connections);
      if (saved) return { host, note: null, via: saved.name, jump: { connectionId: saved.id } };
      const through = rowFor(named);
      return through.note === null
        ? { host, note: null, via: named.alias, jump: { alias: named.alias } }
        : { host, note: 'jump', via: named.alias, jump: null };
    }

    const saved = savedAs(
      { hostName: target.host, port: target.port ?? 22, user: target.username ?? null },
      connections
    );
    return saved
      ? { host, note: null, via: saved.name, jump: { connectionId: saved.id } }
      : { host, note: 'jump', via, jump: null };
  }

  return hosts.map(rowFor);
}

/** The row `row` jumps through, when that's another host in the list. */
function jumpRow(row: ImportRow, rows: ImportRow[]): ImportRow | undefined {
  const { jump } = row;
  if (!jump || !('alias' in jump)) return undefined;
  return rows.find(({ host }) => host.alias.toLowerCase() === jump.alias.toLowerCase());
}

/** Whether `row` goes through `via`, directly or further along. */
export function goesThrough(row: ImportRow, via: ImportRow, rows: ImportRow[]): boolean {
  const seen = new Set<ImportRow>();
  for (let next = jumpRow(row, rows); next && !seen.has(next); next = jumpRow(next, rows)) {
    if (next === via) return true;
    seen.add(next);
  }
  return false;
}

/** The rows to add for the ticked ones: those, and the rows they go through, in list order. */
export function withJumps(rows: ImportRow[], ticked: ImportRow[]): ImportRow[] {
  const wanted = new Set<ImportRow>();
  const want = (row: ImportRow | undefined) => {
    if (!row || wanted.has(row)) return;
    wanted.add(row);
    want(jumpRow(row, rows));
  };
  ticked.forEach(want);
  return rows.filter((row) => wanted.has(row));
}

/**
 * The rows as new connections. Each goes through its jump host: a saved connection, or
 * one of the rows, which must be among them (see withJumps).
 */
export function importConnections(
  rows: ImportRow[],
  user: string,
  groupId: string,
  newId: () => string = newConnectionId
): Connection[] {
  const ids = new Map(rows.map(({ host }) => [host.alias.toLowerCase(), newId()]));
  return rows.map((row) => {
    const { jump } = row;
    let jumpId = '';
    if (jump && 'connectionId' in jump) jumpId = jump.connectionId;
    else if (jump) {
      const id = ids.get(jump.alias.toLowerCase());
      // Without it, the host would be reached directly: maybe a different computer.
      if (!id) throw new Error(`${row.host.alias} goes through ${jump.alias}, which isn’t added`);
      jumpId = id;
    }
    return toConnection(
      { ...importInput(row.host, user, groupId), jumpId },
      ids.get(row.host.alias.toLowerCase())!
    );
  });
}
