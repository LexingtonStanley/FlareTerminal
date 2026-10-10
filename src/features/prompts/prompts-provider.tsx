import { createContext, use, useState, type PropsWithChildren } from 'react';

import { readJson, writeJson } from '@/lib/storage';

import { newPromptId, toSavedPrompt, type SavedPrompt } from './prompts';

const STORAGE_KEY = 'flare.prompts.v1';

type PromptsContextValue = {
  /** In the order they were saved, which is the order the composer offers them. */
  prompts: SavedPrompt[];
  /** Saves the text (trimmed), unless it's empty or saved already. */
  add(text: string): void;
  remove(id: string): void;
};

const PromptsContext = createContext<PromptsContextValue | null>(null);

/** Prompts the person saved to send again, on the phone (they aren't secrets). */
export function PromptsProvider({ children }: PropsWithChildren) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>(() =>
    (readJson<unknown[]>(STORAGE_KEY) ?? []).map(toSavedPrompt).filter((prompt) => prompt !== null)
  );

  function commit(next: SavedPrompt[]) {
    writeJson(STORAGE_KEY, next);
    setPrompts(next);
  }

  const value: PromptsContextValue = {
    prompts,
    add(text) {
      const trimmed = text.trim();
      if (!trimmed || prompts.some((prompt) => prompt.text === trimmed)) return;
      commit([...prompts, { id: newPromptId(), text: trimmed }]);
    },
    remove(id) {
      commit(prompts.filter((prompt) => prompt.id !== id));
    },
  };

  return <PromptsContext value={value}>{children}</PromptsContext>;
}

export function usePrompts(): PromptsContextValue {
  const value = use(PromptsContext);
  if (!value) throw new Error('usePrompts must be used inside <PromptsProvider>');
  return value;
}
