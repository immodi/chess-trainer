import { createStore, del, get, set } from 'idb-keyval';

/**
 * One IndexedDB database for the whole app. Keys are plain strings so the
 * schema stays readable in devtools.
 */
const store = createStore('chess-trainer', 'app');

export async function readValue<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, store);
  } catch {
    // Private mode / storage disabled: behave as if nothing was saved.
    return undefined;
  }
}

export async function writeValue<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value, store);
  } catch {
    // Losing a save must never break the game in progress.
  }
}

export async function removeValue(key: string): Promise<void> {
  try {
    await del(key, store);
  } catch {
    // ignore
  }
}
