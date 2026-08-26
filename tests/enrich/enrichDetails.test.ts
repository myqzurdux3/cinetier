import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { enrichDetails, countPendingDetails } from '@/enrich/enrichDetails';
import { resetDatabase } from '@/services/db';
import { makeFilm } from '../support/film';
import type * as TmdbModule from '@/services/tmdb';

const fetchMovieDetails = vi.fn();
const fetchTvDetails = vi.fn();

// The real module is spread in, not replaced wholesale: `TmdbUnavailable` is a
// class the code under test compares against with `instanceof`, so a mock that
// leaves it out makes that check throw rather than fail.
vi.mock('@/services/tmdb', async () => {
  const actual = await vi.importActual<typeof TmdbModule>('@/services/tmdb');
  return {
    ...actual,
    fetchMovieDetails: (id: number) => fetchMovieDetails(id) as unknown,
    fetchTvDetails: (id: number) => fetchTvDetails(id) as unknown,
  };
});

beforeEach(async () => {
  await resetDatabase();
  fetchMovieDetails.mockReset();
  fetchTvDetails.mockReset();
  fetchMovieDetails.mockResolvedValue({
    genres: ['Drama'],
    runtimeMinutes: 170,
    directors: ['Michael Mann'],
  });
  fetchTvDetails.mockResolvedValue({
    genres: ['Crime'],
    runtimeMinutes: 47,
    directors: ['Vince Gilligan'],
  });
});

describe('enrichDetails when TMDB cannot be reached', () => {
  it('leaves the cache untouched so the title is asked about again', async () => {
    // Genres and runtimes are cached for thirty days like posters, and a
    // failed request used to be stored as the same null a definitive "TMDB has
    // nothing" is. One dropped connection held a title's details back for a
    // month.
    const { TmdbUnavailable } = await import('@/services/tmdb');
    const { getCachedDetails } = await import('@/services/tmdbDetailsCache');
    const film = makeFilm({ title: 'Heat', tmdbId: 949 });

    fetchMovieDetails.mockRejectedValue(new TmdbUnavailable('the network dropped'));
    const first = await enrichDetails([film], () => {});

    // The pass still finishes, and the film is left unmarked so a later visit
    // tries again.
    expect(first).toHaveLength(1);
    expect(first[0]!.detailsFetched).toBe(false);
    expect(await getCachedDetails('movie:949')).toBeUndefined();

    fetchMovieDetails.mockResolvedValue({
      genres: ['Crime'],
      runtimeMinutes: 170,
      directors: ['Michael Mann'],
    });
    const second = await enrichDetails([film], () => {});
    expect(second[0]!.genres).toEqual(['Crime']);
  });
});

describe('countPendingDetails', () => {
  it('counts only films with a TMDB id and no details yet', () => {
    const films = [
      makeFilm({ title: 'has id', tmdbId: 1 }),
      makeFilm({ title: 'already done', tmdbId: 2, detailsFetched: true }),
      makeFilm({ title: 'never matched', tmdbId: null }),
    ];
    expect(countPendingDetails(films)).toBe(1);
  });
});

describe('enrichDetails', () => {
  it('fills in genres, runtime and directors, and marks the film as asked about', async () => {
    const films = [makeFilm({ title: 'Heat', tmdbId: 949 })];
    const enriched = await enrichDetails(films, () => {});

    expect(enriched[0]).toMatchObject({
      genres: ['Drama'],
      runtimeMinutes: 170,
      directors: ['Michael Mann'],
      detailsFetched: true,
    });
  });

  it('asks the television endpoint for a series', async () => {
    // Asking /movie about a series returns nothing, and a library of series
    // would end up with no genres at all and no error to show for it.
    const films = [makeFilm({ title: 'Breaking Bad', tmdbId: 1396, titleType: 'series' })];
    const enriched = await enrichDetails(films, () => {});

    expect(fetchTvDetails).toHaveBeenCalledWith(1396);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
    expect(enriched[0]!.genres).toEqual(['Crime']);
  });

  it('asks the television endpoint for a mini-series too', async () => {
    await enrichDetails(
      [makeFilm({ title: 'Chernobyl', tmdbId: 87108, titleType: 'miniSeries' })],
      () => {},
    );
    expect(fetchTvDetails).toHaveBeenCalledWith(87108);
  });

  it('asks the movie endpoint for a TV film', async () => {
    // TMDB files television films under /movie; only ongoing television is /tv.
    await enrichDetails(
      [makeFilm({ title: 'Duel', tmdbId: 11040, titleType: 'tvMovie' })],
      () => {},
    );
    expect(fetchMovieDetails).toHaveBeenCalledWith(11040);
  });

  it('marks a film as asked about even when TMDB answered with nothing', async () => {
    fetchMovieDetails.mockResolvedValue({ genres: [], runtimeMinutes: null, directors: [] });
    const enriched = await enrichDetails([makeFilm({ title: 'Obscure', tmdbId: 7 })], () => {});
    expect(enriched[0]!.detailsFetched).toBe(true);
    expect(enriched[0]!.genres).toEqual([]);
  });

  it('leaves a film unmarked when the lookup failed, so a later visit retries', async () => {
    fetchMovieDetails.mockResolvedValue(null);
    const enriched = await enrichDetails([makeFilm({ title: 'Offline', tmdbId: 7 })], () => {});
    expect(enriched[0]!.detailsFetched).toBe(false);
  });

  it('never displaces what the export already supplied', async () => {
    // An IMDb export carries genres and runtime the user can see in their own
    // file. TMDB does not get to overrule it.
    const films = [
      makeFilm({ title: 'Heat', tmdbId: 949, genres: ['Thriller'], runtimeMinutes: 165 }),
    ];
    const enriched = await enrichDetails(films, () => {});
    expect(enriched[0]!.genres).toEqual(['Thriller']);
    expect(enriched[0]!.runtimeMinutes).toBe(165);
    expect(enriched[0]!.directors).toEqual(['Michael Mann']);
  });

  it('skips films with no TMDB id and does not count them in the total', async () => {
    const progress: number[] = [];
    const films = [
      makeFilm({ title: 'no id', tmdbId: null }),
      makeFilm({ title: 'Heat', tmdbId: 949 }),
    ];

    await enrichDetails(films, (p) => progress.push(p.total));

    expect(fetchMovieDetails).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([1]);
  });

  it('asks TMDB once for a title it already looked up', async () => {
    await enrichDetails([makeFilm({ title: 'Heat', tmdbId: 949 })], () => {});
    await enrichDetails([makeFilm({ title: 'Heat again', tmdbId: 949 })], () => {});
    expect(fetchMovieDetails).toHaveBeenCalledTimes(1);
  });

  it('keeps separate cache entries for a film and a series that share a numeric TMDB id', async () => {
    // The cache key's `${kind}:` prefix is the only thing standing between a
    // film and a series landing on the same cache entry — drop it and a
    // series would silently inherit a film's genres, directors and runtime.
    await enrichDetails([makeFilm({ title: 'Movie', tmdbId: 100, titleType: 'movie' })], () => {});
    await enrichDetails(
      [makeFilm({ title: 'Series', tmdbId: 100, titleType: 'series' })],
      () => {},
    );

    expect(fetchMovieDetails).toHaveBeenCalledWith(100);
    expect(fetchTvDetails).toHaveBeenCalledWith(100);
  });

  it('reports progress once per film, in order', async () => {
    const seen: { done: number; total: number }[] = [];
    const films = [
      makeFilm({ title: 'a', tmdbId: 1 }),
      makeFilm({ title: 'b', tmdbId: 2 }),
      makeFilm({ title: 'c', tmdbId: 3 }),
    ];

    await enrichDetails(films, (p) => seen.push({ done: p.done, total: p.total }), {
      concurrency: 1,
    });

    expect(seen).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
  });
});
