import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB, type DBSchema } from 'idb';
import { saveLibrary, loadLibrary, clearLibrary } from '@/services/library';
import { db, resetDatabase } from '@/services/db';
import type { Film } from '@/domain/film';

function film(id: string, watchedAt: Date | null = null): Film {
  return {
    id,
    imdbId: null,
    tmdbId: null,
    title: id,
    year: 2000,
    titleType: 'movie',
    rating: 80,
    ratingScale: 'imdb10',
    watchedAt,
    watchedAtIsApproximate: false,
    isRewatch: false,
    genres: [],
    directors: [],
    runtimeMinutes: null,
    publicRating: null,
    posterPath: null,
    detailsFetched: false,
    source: 'imdb',
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe('library persistence', () => {
  it('reports nothing when nothing was ever saved', async () => {
    expect(await loadLibrary()).toBeNull();
  });

  it('reports nothing when the saved library is empty', async () => {
    // A version before series were importable could save an empty library, and
    // restoring one puts the user back on a blank library screen every visit.
    await saveLibrary([]);
    expect(await loadLibrary()).toBeNull();
  });

  it('round-trips a library', async () => {
    await saveLibrary([film('a'), film('b')]);
    const restored = await loadLibrary();
    expect(restored?.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('restores watch dates as Date objects, not strings', async () => {
    await saveLibrary([film('a', new Date('2025-03-09'))]);
    const restored = await loadLibrary();
    expect(restored![0]!.watchedAt).toBeInstanceOf(Date);
    expect(restored![0]!.watchedAt!.toISOString()).toContain('2025-03-09');
  });

  it('forgets the library when asked', async () => {
    await saveLibrary([film('a')]);
    await clearLibrary();
    expect(await loadLibrary()).toBeNull();
  });
});

// v1 shipped with only the 'tmdb' and 'library' stores, at version 1 — see
// `git show 3db0066~1:src/services/db.ts`. This reproduces that shape by hand,
// bypassing the current `db()` entirely, so the upgrade below runs for real
// instead of starting from a database `db()` already created at version 2.
interface CinetierV1Schema extends DBSchema {
  tmdb: { key: string; value: { match: unknown; fetchedAt: number } };
  library: { key: string; value: { films: Film[]; savedAt: number } };
}

describe('the v1 to v2 schema upgrade', () => {
  it('keeps an existing library intact when filters and tmdbDetails are added', async () => {
    const v1 = await openDB<CinetierV1Schema>('cinetier', 1, {
      upgrade(database) {
        database.createObjectStore('tmdb');
        database.createObjectStore('library');
      },
    });
    const saved = { films: [film('a'), film('b')], savedAt: Date.now() };
    try {
      await v1.put('library', saved, 'current');
    } finally {
      // Without this, a failed put leaves the v1 connection open and the next
      // beforeEach's deleteDB blocks — the suite hangs instead of going red.
      v1.close();
    }

    const upgraded = await db();

    // Deliberately pinned to today's VERSION: a bump to 3 should fail here and
    // make whoever bumps it decide what the upgrade owes this test. It did —
    // boards landed as v3, so this now pins 3 and includes 'boards'.
    expect(upgraded.version).toBe(3);
    expect(Array.from(upgraded.objectStoreNames).sort()).toEqual([
      'boards',
      'filters',
      'library',
      'tmdb',
      'tmdbDetails',
    ]);

    const restored = await upgraded.get('library', 'current');
    expect(restored?.films.map((f) => f.id)).toEqual(['a', 'b']);
    expect(restored?.savedAt).toBe(saved.savedAt);
  });
});
