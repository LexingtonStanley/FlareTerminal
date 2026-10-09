import { createContext, use, useState, type PropsWithChildren } from 'react';

import { readJson, writeJson } from '@/lib/storage';

import { newGroupId, type Group, type GroupInput } from './groups';

const STORAGE_KEY = 'flare.groups.v1';

type GroupsContextValue = {
  groups: Group[];
  /** Creates a group, or updates it when `id` is given. Returns the saved record. */
  save(input: GroupInput, id?: string): Group;
  /** Deletes the group; its connections stay, ungrouped. */
  remove(id: string): void;
};

const GroupsContext = createContext<GroupsContextValue | null>(null);

export function GroupsProvider({ children }: PropsWithChildren) {
  const [groups, setGroups] = useState<Group[]>(() => readJson<Group[]>(STORAGE_KEY) ?? []);

  function commit(next: Group[]) {
    writeJson(STORAGE_KEY, next);
    setGroups(next);
  }

  const value: GroupsContextValue = {
    groups,
    save(input, id) {
      const group: Group = {
        id: id ?? newGroupId(),
        name: input.name.trim(),
        protected: input.protected,
      };
      commit(
        id ? groups.map((existing) => (existing.id === id ? group : existing)) : [...groups, group]
      );
      return group;
    },
    remove(id) {
      commit(groups.filter((group) => group.id !== id));
    },
  };

  return <GroupsContext value={value}>{children}</GroupsContext>;
}

export function useGroups(): GroupsContextValue {
  const value = use(GroupsContext);
  if (!value) throw new Error('useGroups must be used inside <GroupsProvider>');
  return value;
}
