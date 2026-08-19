import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveLibrary, loadLibrary, clearLibrary } from '@/services/library';
import { resetDatabase } from '@/services/db';
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
