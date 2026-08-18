import { describe, it, expect } from 'vitest';
import { mergeLibraries } from '@/domain/dedupe';
import type { Film } from '@/domain/film';

function film(overrides: Partial<Film> & Pick<Film, 'title'>): Film {
  return {
    id: `test:${overrides.title}`,
    imdbId: null,
    tmdbId: null,
    year: 1999,
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
    source: 'imdb',
    ...overrides,
  };
}

describe('mergeLibraries', () => {
  it('returns a single library unchanged', () => {
    const library = [film({ title: 'The Matrix' })];
    expect(mergeLibraries(library)).toHaveLength(1);
  });

  it('merges the same film imported from both services', () => {
    const imdb = [film({ title: 'The Matrix', imdbId: 'tt0133093', rating: 90 })];
    const letterboxd = [film({ title: 'The Matrix', source: 'letterboxd', imdbId: 'tt0133093' })];
    expect(mergeLibraries(imdb, letterboxd)).toHaveLength(1);
  });

  it('matches on title and year when no IMDb identifier is available', () => {
    const imdb = [film({ title: 'Amélie', year: 2001, imdbId: null })];
    const letterboxd = [film({ title: 'Amelie', year: 2001, source: 'letterboxd' })];
    expect(mergeLibraries(imdb, letterboxd)).toHaveLength(1);
  });

  it('keeps a remake separate from the original', () => {
    const merged = mergeLibraries(
      [film({ title: 'Dune', year: 1984 })],
      [film({ title: 'Dune', year: 2021, source: 'letterboxd' })],
    );
    expect(merged).toHaveLength(2);
  });

  it('prefers the record carrying a precise watch date', () => {
    const imdb = [
      film({
        title: 'Parasite',
        imdbId: 'tt6751668',
        watchedAt: new Date('2024-01-01'),
        watchedAtIsApproximate: true,
      }),
    ];
    const letterboxd = [
      film({
        title: 'Parasite',
        imdbId: 'tt6751668',
        source: 'letterboxd',
        watchedAt: new Date('2023-09-01'),
      }),
    ];
    const [merged] = mergeLibraries(imdb, letterboxd);
    expect(merged!.watchedAt).toEqual(new Date('2023-09-01'));
    expect(merged!.watchedAtIsApproximate).toBe(false);
  });

  it('fills gaps from whichever record has the metadata', () => {
    const imdb = [
      film({ title: 'Parasite', imdbId: 'tt6751668', genres: ['Drama'], runtimeMinutes: 132 }),
    ];
    const letterboxd = [
      film({ title: 'Parasite', imdbId: 'tt6751668', source: 'letterboxd', rating: 100 }),
    ];
    const [merged] = mergeLibraries(imdb, letterboxd);
    expect(merged!.genres).toEqual(['Drama']);
    expect(merged!.runtimeMinutes).toBe(132);
    expect(merged!.rating).toBe(100);
  });
});
