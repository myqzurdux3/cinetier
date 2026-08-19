import type { Film } from '@/domain/film';

/**
 * A film with every field at a neutral default, for tests that care about one
 * or two of them. New tests use this; the older per-file factories stay as they
 * are.
 */
export function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: overrides.title ? `test:${overrides.title}` : 'test:untitled',
    imdbId: null,
    tmdbId: null,
    title: 'Untitled',
    year: 2000,
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
    source: 'imdb',
    ...overrides,
  };
}
