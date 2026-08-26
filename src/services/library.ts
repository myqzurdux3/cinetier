import { db, reportDatabaseStall } from './db';
import type { Film } from '@/domain/film';

const KEY = 'current';

/**
 * The shape of a saved library, so a future change to `Film` can tell what it
 * is reading rather than assuming.
 *
 * Records written before this stamp existed carry no version at all, and their
 * shape is the one version 1 describes — so an absent version reads as 1 and
 * nothing already on disk is refused. What is refused is a *higher* version:
 * that record was written by a newer build, and reading it as this shape is
 * exactly the silent corruption the stamp is for.
 */
export const LIBRARY_VERSION = 1;

/**
 * Persist the whole library. IndexedDB stores structured clones, so Date
 * objects survive as Dates — do not route this through JSON.
 */
export async function saveLibrary(films: Film[]): Promise<void> {
  await (await db()).put('library', { version: LIBRARY_VERSION, films, savedAt: Date.now() }, KEY);
}

export async function loadLibrary(): Promise<Film[] | null> {
  const entry = await (await db()).get('library', KEY);
  const version = entry?.version ?? LIBRARY_VERSION;
  if (version > LIBRARY_VERSION) {
    console.error(
      `The saved library is version ${String(version)}; this build reads ${String(LIBRARY_VERSION)}. ` +
        'Refusing to read it as the older shape.',
    );
    reportDatabaseStall({ reason: 'newer', store: 'library' });
    return null;
  }
  // An empty saved library is indistinguishable from no library, and restoring
  // it strands the user on a library screen with nothing on it and no way to
  // read what went wrong. Earlier versions could save one, so this also
  // releases anyone already holding it.
  return entry?.films?.length ? entry.films : null;
}

export async function clearLibrary(): Promise<void> {
  await (await db()).delete('library', KEY);
}
