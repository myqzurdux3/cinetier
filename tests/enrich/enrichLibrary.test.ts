import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { enrichLibrary } from '@/enrich/enrichLibrary';
import { resetDatabase } from '@/services/db';
import type { Film } from '@/domain/film';
// Named namespace import purely for its type: `consistent-type-imports` forbids the
// brief's inline `typeof import('@/services/tmdb')`, so the module type is captured
// here instead and referenced by name below. No behavioral difference from the brief.
import type * as TmdbModule from '@/services/tmdb';

vi.mock('@/services/tmdb', async () => {
  const actual = await vi.importActual<typeof TmdbModule>('@/services/tmdb');
  return {
    ...actual,
    lookupByImdbId: vi.fn(),
    searchByTitle: vi.fn(),
  };
});

const { lookupByImdbId, searchByTitle } = await import('@/services/tmdb');

function film(overrides: Partial<Film> & Pick<Film, 'id' | 'title'>): Film {
  return {
    imdbId: null,
    tmdbId: null,
    year: 1999,
    titleType: 'movie',
    rating: null,
    ratingScale: 'imdb10',
    watchedAt: null,
    watchedAtIsApproximate: false,
    isRewatch: false,
    genres: [],
    directors: [],
    runtimeMinutes: null,
    publicRating: null,
    posterPath: null,
    detailsFetched: false,
    source: 'letterboxd',
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(lookupByImdbId).mockReset();
  vi.mocked(searchByTitle).mockReset();
});

describe('enrichLibrary', () => {
  it('uses the IMDb identifier when the film has one', async () => {
    vi.mocked(lookupByImdbId).mockResolvedValue({
      tmdbId: 603,
      imdbId: 'tt0133093',
      posterPath: '/m.jpg',
      publicRating: 82,
    });

    const result = await enrichLibrary(
      [film({ id: 'imdb:tt0133093', title: 'The Matrix', imdbId: 'tt0133093', source: 'imdb' })],
      () => {},
    );

    expect(lookupByImdbId).toHaveBeenCalledWith('tt0133093');
    expect(searchByTitle).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({ tmdbId: 603, posterPath: '/m.jpg' });
  });

  it('falls back to a title search when there is no identifier', async () => {
    vi.mocked(searchByTitle).mockResolvedValue({
      tmdbId: 438631,
      imdbId: null,
      posterPath: '/dune.jpg',
      publicRating: 78,
    });

    const result = await enrichLibrary(
      [film({ id: 'lb:dune', title: 'Dune', year: 2021 })],
      () => {},
    );

    expect(searchByTitle).toHaveBeenCalledWith('Dune', 2021);
    expect(result[0]!.posterPath).toBe('/dune.jpg');
  });

  it('never overwrites a rating the user gave with the public one', async () => {
    vi.mocked(searchByTitle).mockResolvedValue({
      tmdbId: 1,
      imdbId: null,
      posterPath: null,
      publicRating: 78,
    });

    const result = await enrichLibrary([film({ id: 'lb:x', title: 'X', rating: 100 })], () => {});

    expect(result[0]!.rating).toBe(100);
    expect(result[0]!.publicRating).toBe(78);
  });

  it('keeps a public rating the export already supplied', async () => {
    vi.mocked(lookupByImdbId).mockResolvedValue({
      tmdbId: 1,
      imdbId: 'tt1',
      posterPath: null,
      publicRating: 50,
    });

    const result = await enrichLibrary(
      [film({ id: 'imdb:tt1', title: 'X', imdbId: 'tt1', publicRating: 87, source: 'imdb' })],
      () => {},
    );

    expect(result[0]!.publicRating).toBe(87);
  });

  it('reports progress as it goes and finishes at the total', async () => {
    vi.mocked(searchByTitle).mockResolvedValue(null);
    const seen: number[] = [];

    await enrichLibrary(
      [film({ id: 'a', title: 'A' }), film({ id: 'b', title: 'B' }), film({ id: 'c', title: 'C' })],
      (progress) => seen.push(progress.done),
      { concurrency: 1 },
    );

    expect(seen.at(-1)).toBe(3);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('asks TMDB once per film even across two runs, thanks to the cache', async () => {
    vi.mocked(searchByTitle).mockResolvedValue({
      tmdbId: 7,
      imdbId: null,
      posterPath: '/p.jpg',
      publicRating: null,
    });

    const library = [film({ id: 'lb:x', title: 'X', year: 2000 })];
    await enrichLibrary(library, () => {});
    await enrichLibrary(library, () => {});

    expect(searchByTitle).toHaveBeenCalledTimes(1);
  });

  it('survives a film TMDB knows nothing about', async () => {
    vi.mocked(searchByTitle).mockResolvedValue(null);
    const result = await enrichLibrary([film({ id: 'lb:x', title: 'Unknown' })], () => {});
    expect(result).toHaveLength(1);
    expect(result[0]!.posterPath).toBeNull();
  });

  it('re-merges once enrichment gives two records the same TMDB identifier', async () => {
    vi.mocked(lookupByImdbId).mockResolvedValue({
      tmdbId: 603,
      imdbId: 'tt0133093',
      posterPath: '/m.jpg',
      publicRating: 82,
    });
    // searchByTitle never returns an imdbId in production — TMDB's search endpoint
    // does not report one, only `find`-by-id does, and that requires already having
    // one. So the Letterboxd side of this match can only ever gain a tmdbId, never
    // an imdbId; dedupe has to be able to fold the two records together on that
    // alone, which is what this test (and the dedupe fix it relies on) proves.
    vi.mocked(searchByTitle).mockResolvedValue({
      tmdbId: 603,
      imdbId: null,
      posterPath: '/m.jpg',
      publicRating: 82,
    });

    // Same film, two services, titles that do not normalize to the same string.
    const result = await enrichLibrary(
      [
        film({ id: 'imdb:tt0133093', title: 'The Matrix', imdbId: 'tt0133093', source: 'imdb' }),
        film({ id: 'lb:matrix', title: 'Matrix, The', year: 1999 }),
      ],
      () => {},
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.imdbId).toBe('tt0133093');
  });
});
