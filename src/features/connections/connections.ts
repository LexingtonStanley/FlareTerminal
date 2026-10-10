import { isPrivateHost, ttydSocketUrl } from '@/features/terminal/ttyd';

/**
 * Saved hosts. SSH (the default) needs nothing on the computer beyond its SSH server;
 * ttyd also works in the browser. Passwords live in secure storage under passwordKey(id).
 */

export type ConnectionKind = 'ssh' | 'ttyd';

/** Settings every kind shares. Absent in records saved before they existed. */
type ConnectionAccess = {
  /** The group it is listed under, if any. */
  groupId?: string | null;
  /** Ask for the app lock each time the person comes back to its sessions. */
  protected?: boolean;
  /** False: its sessions close when the person leaves them or the app. */
  keepAlive?: boolean;
};

export type SshConnection = ConnectionAccess & {
  id: string;
  kind: 'ssh';
  name: string;
  host: string;
  port: number;
  username: string;
  /** The SSH key to offer: a key's id, NO_KEY for none, absent for every key. */
  keyId?: string | null;
  /** Another SSH connection to go through to reach it (`ssh -J`), or none. */
  jumpId?: string | null;
};

export type TtydConnection = ConnectionAccess & {
  id: string;
  kind: 'ttyd';
  name: string;
  /** What the person typed; see ttydSocketUrl for the accepted forms. */
  url: string;
  /** Empty when the host has no credential (`ttyd -c` not set). */
  username: string;
};

export type Connection = SshConnection | TtydConnection;

/** The connection form's fields, as typed. */
export type ConnectionInput = {
  kind: ConnectionKind;
  name: string;
  host: string;
  port: string;
  url: string;
  username: string;
  password: string;
  /** '' for no group. */
  groupId: string;
  /** SSH: '' to offer every key, else as SshConnection.keyId. */
  keyId: string;
  /** SSH: the connection to go through, '' for none. */
  jumpId: string;
  protected: boolean;
  keepAlive: boolean;
};

/** The form's fields that are typed into a text field. */
export type ConnectionTextField = 'name' | 'host' | 'port' | 'url' | 'username' | 'password';

export type ConnectionErrors = Partial<Record<keyof ConnectionInput, string>>;

export const EMPTY_CONNECTION_INPUT: ConnectionInput = {
  kind: 'ssh',
  name: '',
  host: '',
  port: '22',
  url: '',
  username: '',
  password: '',
  groupId: '',
  keyId: '',
  jumpId: '',
  protected: false,
  keepAlive: true,
};

/** What to run on the computer for ttyd: writable (-W), password-protected (-c), lasting tmux. */
export const TTYD_COMMAND = 'ttyd -W -c you:a-long-password tmux new -A -s main';

export const passwordKey = (id: string) => `connection.${id}.password`;

export function newConnectionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Reads `user@host:port` (or plain `host`, `[::1]:22`, `ssh user@host`) as typed into Host. */
export function parseSshTarget(text: string): { username?: string; host: string; port?: number } {
  const match = /^(?:([^@\s]+)@)?(\[[^\]\s]+\]|[^:@\s/]+)(?::(\d+))?$/.exec(
    text.trim().replace(/^ssh\s+/, '')
  );
  if (!match) return { host: text.trim() };
  const [, username, host, port] = match;
  return { username, host: host.replace(/^\[|\]$/g, ''), port: port ? Number(port) : undefined };
}

/** The form's values with `user@host:port` in Host split into its fields. */
function sshFields(input: ConnectionInput) {
  const target = parseSshTarget(input.host);
  return {
    host: target.host,
    username: input.username.trim() || target.username || '',
    port: target.port ?? Number(input.port.trim() || 22),
  };
}

export function validateConnection(input: ConnectionInput): ConnectionErrors {
  const errors: ConnectionErrors = {};
  if (input.kind === 'ssh') {
    const { host, username, port } = sshFields(input);
    if (!host) errors.host = 'Enter the computer’s name or IP, e.g. lexbox';
    else if (!/^[\w.:-]+$/.test(host)) errors.host = 'Enter just the name or IP, e.g. lexbox';
    if (!username) errors.username = 'Enter your username on that computer';
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      errors.port = 'Use a port from 1 to 65535';
    return errors;
  }

  if (!input.url.trim()) errors.url = 'Enter the address ttyd is listening on';
  else {
    try {
      ttydSocketUrl(input.url);
    } catch (error) {
      errors.url = (error as Error).message;
    }
  }
  if (input.username.trim() && !input.password) {
    errors.password = 'Enter the password for this username';
  }
  return errors;
}

/** How a connection is shown when it has no name: `lexde@lexbox`, or the ttyd address. */
export function connectionLabel(connection: Connection): string {
  if (connection.kind === 'ttyd') return connection.url;
  const port = connection.port === 22 ? '' : `:${connection.port}`;
  return `${connection.username}@${connection.host}${port}`;
}

/** Builds the saved record from valid form input. */
export function toConnection(input: ConnectionInput, id: string): Connection {
  const access: ConnectionAccess = {
    groupId: input.groupId || null,
    protected: input.protected,
    keepAlive: input.keepAlive,
  };
  if (input.kind === 'ssh') {
    const fields = sshFields(input);
    const connection: SshConnection = {
      id,
      kind: 'ssh',
      name: '',
      ...fields,
      keyId: input.keyId || null,
      jumpId: input.jumpId || null,
      ...access,
    };
    return { ...connection, name: input.name.trim() || connectionLabel(connection) };
  }
  const url = input.url.trim();
  return {
    id,
    kind: 'ttyd',
    name: input.name.trim() || url,
    url,
    username: input.username.trim(),
    ...access,
  };
}

/**
 * The connections to go through to reach `connection`, like `ssh -J`: the first is reached
 * directly, each next one from the one before. An error instead when one of them was deleted,
 * isn't SSH, or they go round in a circle: the session can't connect then.
 */
export function jumpHosts(
  connection: Connection,
  connections: Connection[]
): { hops: SshConnection[] } | { error: string } {
  const hops: SshConnection[] = [];
  let current = connection;
  while (current.kind === 'ssh' && current.jumpId) {
    const jumpId = current.jumpId;
    const jump = connections.find(({ id }) => id === jumpId);
    if (!jump) {
      return { error: `${current.name}’s jump host was deleted. Choose another in its settings.` };
    }
    if (jump.kind !== 'ssh')
      return { error: `${jump.name} isn’t SSH, so it can’t be a jump host.` };
    if (jump.id === connection.id || hops.includes(jump)) {
      return { error: 'Its jump hosts go round in a circle. Choose another in its settings.' };
    }
    hops.unshift(jump);
    current = jump;
  }
  return { hops };
}

/**
 * The connections that connection `id` (null for a new one) can go through: SSH ones that
 * can connect and don't go through it themselves.
 */
export function jumpChoices(id: string | null, connections: Connection[]): SshConnection[] {
  return connections.filter((candidate): candidate is SshConnection => {
    if (candidate.kind !== 'ssh' || candidate.id === id) return false;
    const chain = jumpHosts(candidate, connections);
    return 'hops' in chain && !chain.hops.some((hop) => hop.id === id);
  });
}

/** Whether leaving a session on this connection keeps it running (the default). */
export const keepsAlive = (connection: Connection) => connection.keepAlive !== false;

/** The form's values for a saved connection. */
export function toInput(connection: Connection, password: string | null): ConnectionInput {
  const access = {
    groupId: connection.groupId ?? '',
    protected: connection.protected === true,
    keepAlive: keepsAlive(connection),
  };
  return connection.kind === 'ssh'
    ? {
        ...EMPTY_CONNECTION_INPUT,
        ...access,
        kind: 'ssh',
        name: connection.name,
        host: connection.host,
        port: String(connection.port),
        username: connection.username,
        password: password ?? '',
        keyId: connection.keyId ?? '',
        jumpId: connection.jumpId ?? '',
      }
    : {
        ...EMPTY_CONNECTION_INPUT,
        ...access,
        kind: 'ttyd',
        name: connection.name,
        url: connection.url,
        username: connection.username,
        password: password ?? '',
      };
}

/** Saved connections from before SSH existed were all ttyd. */
export function migrateConnection(stored: unknown): Connection | null {
  if (!stored || typeof stored !== 'object') return null;
  const record = stored as Partial<Connection> & { url?: string };
  if (record.kind === 'ssh' || record.kind === 'ttyd') return record as Connection;
  if (typeof record.url === 'string' && typeof record.id === 'string') {
    return { ...(record as TtydConnection), kind: 'ttyd' };
  }
  return null;
}

/** A warning for ttyd addresses that would send the session unencrypted over the internet. */
export function connectionWarning(input: ConnectionInput): string | null {
  if (input.kind !== 'ttyd') return null;
  let socketUrl: URL;
  try {
    socketUrl = new URL(ttydSocketUrl(input.url));
  } catch {
    return null;
  }
  if (socketUrl.protocol === 'wss:' || isPrivateHost(socketUrl.hostname)) return null;
  return 'This address is not encrypted. Use https:// or a private network such as Tailscale.';
}
