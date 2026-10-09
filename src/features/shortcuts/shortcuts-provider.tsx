import { createContext, use, useState, type PropsWithChildren } from 'react';

import { readJson, writeJson } from '@/lib/storage';

import { newShortcutId, type Shortcut, type ShortcutInput } from './shortcuts';

const STORAGE_KEY = 'flare.shortcuts.v1';

type ShortcutsContextValue = {
  shortcuts: Shortcut[];
  save(input: ShortcutInput, id?: string): Shortcut;
  remove(id: string): void;
  /** Drops shortcuts whose connection was deleted. */
  removeForConnection(connectionId: string): void;
};

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export function ShortcutsProvider({ children }: PropsWithChildren) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(
    () => readJson<Shortcut[]>(STORAGE_KEY) ?? []
  );

  function commit(next: Shortcut[]) {
    writeJson(STORAGE_KEY, next);
    setShortcuts(next);
  }

  const value: ShortcutsContextValue = {
    shortcuts,
    save(input, id) {
      const shortcut: Shortcut = {
        id: id ?? newShortcutId(),
        name: input.name.trim(),
        connectionId: input.connectionId,
        command: input.command.trim(),
        directory: input.directory.trim(),
      };
      commit(
        id
          ? shortcuts.map((existing) => (existing.id === id ? shortcut : existing))
          : [...shortcuts, shortcut]
      );
      return shortcut;
    },
    remove(id) {
      commit(shortcuts.filter((shortcut) => shortcut.id !== id));
    },
    removeForConnection(connectionId) {
      commit(shortcuts.filter((shortcut) => shortcut.connectionId !== connectionId));
    },
  };

  return <ShortcutsContext value={value}>{children}</ShortcutsContext>;
}

export function useShortcuts(): ShortcutsContextValue {
  const value = use(ShortcutsContext);
  if (!value) throw new Error('useShortcuts must be used inside <ShortcutsProvider>');
  return value;
}
