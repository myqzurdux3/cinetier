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

  it('merges across services when only IMDb export has the identifier', () => {
    const imdb = [film({ title: 'The Matrix', year: 1999, imdbId: 'tt0133093', rating: 90 })];
    const letterboxd = [
      film({ title: 'The Matrix', year: 1999, source: 'letterboxd', imdbId: null }),
    ];
    expect(mergeLibraries(imdb, letterboxd)).toHaveLength(1);
  });

  it('keeps remakes separate even when only one has an IMDb identifier', () => {
    const merged = mergeLibraries(
      [film({ title: 'Dune', year: 1984, imdbId: 'tt0087182' })],
      [film({ title: 'Dune', year: 2021, source: 'letterboxd', imdbId: null })],
    );
    expect(merged).toHaveLength(2);
  });

  it('merges all permutations correctly when keys eventually collide', () => {
    // Three films that should merge in any order:
    // A: "The Matrix" with ID tt0133093 (IMDb style)
    // B: "The Matrix" without ID (Letterboxd style)
    // C: "Matrix, The" with ID tt0133093 (different title normalization)
    const A = [film({ title: 'The Matrix', year: 1999, imdbId: 'tt0133093', rating: 90 })];
    const B = [
      film({
        title: 'The Matrix',
        year: 1999,
        source: 'letterboxd',
        imdbId: null,
        rating: 80,
      }),
    ];
    const C = [film({ title: 'Matrix, The', year: 1999, imdbId: 'tt0133093', rating: 70 })];

    // All six permutations must produce exactly one film with the IMDb ID
    const permutations: Array<[typeof A, typeof B, typeof C]> = [
      [A, B, C],
      [A, C, B],
      [B, A, C],
      [B, C, A],
      [C, A, B],
      [C, B, A],
    ];

    for (let i = 0; i < permutations.length; i++) {
      const [lib1, lib2, lib3] = permutations[i]!;
      const result = mergeLibraries(lib1, lib2, lib3);
      expect(result, `Permutation ${i} failed`).toHaveLength(1);
      expect(result[0]?.imdbId, `Permutation ${i} lost IMDb ID`).toBe('tt0133093');
    }
  });

  it('properly merges films connected through different key types', () => {
    // Two potentially unrelated films that get pulled together by a third film's keys.
    // When mergeWithFirst arrives with both an ID (matching first) and a title (matching unrelated),
    // it creates a linkage that causes all three to merge into one record.
    // The important thing is that unrelated is not silently destroyed.
    const first = [film({ title: 'Foo', year: 2000, imdbId: 'ttFoo', rating: 50 })];
    const unrelated = [
      film({
        title: 'Bar',
        year: 2000,
        source: 'letterboxd',
        imdbId: null,
        rating: 60,
      }),
    ];
    const mergeWithFirst = [film({ title: 'Bar', year: 2000, imdbId: 'ttFoo', rating: 70 })];

    const result = mergeLibraries(first, unrelated, mergeWithFirst);

    // All three merge into one film via the shared IMDb ID and title keys
    expect(result).toHaveLength(1);
    // The merged result has the shared IMDb ID
    expect(result[0]?.imdbId).toBe('ttFoo');
  });
});
