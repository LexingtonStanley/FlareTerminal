import type { Connection } from '@/features/connections/connections';

/**
 * Groups of connections (work, home, production), shown as tabs on Home. A protected group
 * asks for the app lock each time the person comes back to any of its sessions.
 */

export type Group = { id: string; name: string; protected: boolean };

export type GroupInput = { name: string; protected: boolean };

export const EMPTY_GROUP_INPUT: GroupInput = { name: '', protected: false };

export function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function validateGroup(input: GroupInput, others: Group[]): string | null {
  const name = input.name.trim();
  if (!name) return 'Give the group a name, e.g. Work';
  if (others.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
    return 'There is already a group with this name';
  }
  return null;
}

/** The connection's group, if it has one that still exists. */
export function groupOf(connection: Connection | undefined, groups: Group[]): Group | null {
  if (!connection?.groupId) return null;
  return groups.find(({ id }) => id === connection.groupId) ?? null;
}

/**
 * What one unlock opens: the whole group when the group is protected, else the connection
 * when it is. Null when neither is protected.
 */
export function protectionScope(
  connection: Connection | undefined,
  groups: Group[]
): string | null {
  if (!connection) return null;
  const group = groupOf(connection, groups);
  if (group?.protected) return `group:${group.id}`;
  if (connection.protected) return `connection:${connection.id}`;
  return null;
}
