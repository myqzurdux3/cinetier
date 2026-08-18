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
  return entry?.films ?? null;
}

export async function clearLibrary(): Promise<void> {
  await (await db()).delete('library', KEY);
}
