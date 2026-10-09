import { readJson, writeJson } from '@/lib/storage';

/** The port last previewed on each connection, so the preview opens straight to it. */

const STORAGE_KEY = 'flare.preview-ports.v1';

export function lastPreviewPort(connectionId: string): number | null {
  return readJson<Record<string, number>>(STORAGE_KEY)?.[connectionId] ?? null;
}

export function rememberPreviewPort(connectionId: string, port: number): void {
  writeJson(STORAGE_KEY, {
    ...readJson<Record<string, number>>(STORAGE_KEY),
    [connectionId]: port,
  });
}
