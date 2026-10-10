// Small JSON values that must survive restarts: localStorage on web, and an
// SQLite-backed localStorage on Android/iOS (expo-sqlite). Synchronous, so screens
// have their data on the first render. Never store secrets here; see secrets.ts.
import 'expo-sqlite/localStorage/install';

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    // Unparseable data is treated as missing rather than crashing the app.
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeJson(key: string): void {
  localStorage.removeItem(key);
}
