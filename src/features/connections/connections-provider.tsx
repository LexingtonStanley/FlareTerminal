import { createContext, use, useState, type PropsWithChildren } from 'react';

import { getSecret, setSecret } from '@/lib/secrets';
import { readJson, writeJson } from '@/lib/storage';

import { newConnectionId, passwordKey, type Connection, type ConnectionInput } from './connections';

const STORAGE_KEY = 'flare.connections.v1';

type ConnectionsContextValue = {
  connections: Connection[];
  /** Creates a connection, or updates it when `id` is given. Returns the saved record. */
  save(input: ConnectionInput, id?: string): Connection;
  remove(id: string): void;
  /** The stored password, for editing and connecting. */
  getPassword(id: string): string | null;
};

const ConnectionsContext = createContext<ConnectionsContextValue | null>(null);

export function ConnectionsProvider({ children }: PropsWithChildren) {
  const [connections, setConnections] = useState<Connection[]>(
    () => readJson<Connection[]>(STORAGE_KEY) ?? []
  );

  function commit(next: Connection[]) {
    writeJson(STORAGE_KEY, next);
    setConnections(next);
  }

  const value: ConnectionsContextValue = {
    connections,
    save({ password, ...fields }, id) {
      const connection: Connection = {
        id: id ?? newConnectionId(),
        name: fields.name.trim(),
        url: fields.url.trim(),
        username: fields.username.trim(),
      };
      commit(
        id
          ? connections.map((existing) => (existing.id === id ? connection : existing))
          : [...connections, connection]
      );
      setSecret(passwordKey(connection.id), connection.username ? password : null);
      return connection;
    },
    remove(id) {
      commit(connections.filter((connection) => connection.id !== id));
      setSecret(passwordKey(id), null);
    },
    getPassword(id) {
      return getSecret(passwordKey(id));
    },
  };

  return <ConnectionsContext value={value}>{children}</ConnectionsContext>;
}

export function useConnections(): ConnectionsContextValue {
  const value = use(ConnectionsContext);
  if (!value) throw new Error('useConnections must be used inside <ConnectionsProvider>');
  return value;
}
