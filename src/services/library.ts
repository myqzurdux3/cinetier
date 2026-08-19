import { db } from './db';
import type { Film } from '@/domain/film';

const KEY = 'current';

/**
 * Persist the whole library. IndexedDB stores structured clones, so Date
 * objects survive as Dates — do not route this through JSON.
 */
export async function saveLibrary(films: Film[]): Promise<void> {
  await (await db()).put('library', { films, savedAt: Date.now() }, KEY);
}

export async function loadLibrary(): Promise<Film[] | null> {
  const entry = await (await db()).get('library', KEY);
  // An empty saved library is indistinguishable from no library, and restoring
  // it strands the user on a library screen with nothing on it and no way to
  // read what went wrong. Earlier versions could save one, so this also
  // releases anyone already holding it.
  return entry?.films?.length ? entry.films : null;
}

export async function clearLibrary(): Promise<void> {
  await (await db()).delete('library', KEY);
}
