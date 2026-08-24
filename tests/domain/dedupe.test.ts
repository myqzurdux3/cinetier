import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mergeLibraries } from '@/domain/dedupe';
import { parseImdbRatings } from '@/parsers/imdb';
import { parseLetterboxdExport } from '@/parsers/letterboxd';
import type { Film } from '@/domain/film';

function film(overrides: Partial<Film> & Pick<Film, 'title'>): Film {
  return {
    id: `test:${overrides.title}`,
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
    source: 'imdb',
    ...overrides,
  };
}

/** Every ordering of the given items. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
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

  it('merges two records that share a TMDB identifier even with no IMDb id', () => {
    // Enrichment via title search never fills imdbId (TMDB's search endpoint
    // does not return one), so tmdbId has to be able to carry a match on its own.
    const a = [film({ title: 'The Matrix', imdbId: null, tmdbId: 603 })];
    const b = [film({ title: 'Matrix, The', imdbId: null, tmdbId: 603, source: 'letterboxd' })];
    expect(mergeLibraries(a, b)).toHaveLength(1);
  });

  it('merges a record with both identifiers into one that only shares the TMDB id', () => {
    // Titles deliberately do not match, so only the shared tmdbId can be doing the work.
    const a = [film({ title: 'The Matrix', imdbId: 'tt0133093', tmdbId: 603 })];
    const b = [
      film({ title: 'Something Else Entirely', imdbId: null, tmdbId: 603, source: 'letterboxd' }),
    ];
    expect(mergeLibraries(a, b)).toHaveLength(1);
  });

  it('still merges by title and year when TMDB identifiers differ', () => {
    // Adding tmdbId as an identifier must not make title+year matching stricter:
    // a mismatched tmdbId (a bad search match, say) cannot override an otherwise
    // exact title-and-year agreement between two records with no IMDb id.
    const a = [film({ title: 'Foo', year: 2000, imdbId: null, tmdbId: 1 })];
    const b = [film({ title: 'Foo', year: 2000, imdbId: null, tmdbId: 2, source: 'letterboxd' })];
    expect(mergeLibraries(a, b)).toHaveLength(1);
  });

  it('keeps two records with different TMDB identifiers and different years apart', () => {
    const a = [film({ title: 'Foo', year: 2000, imdbId: null, tmdbId: 1 })];
    const b = [film({ title: 'Foo', year: 2010, imdbId: null, tmdbId: 2, source: 'letterboxd' })];
    expect(mergeLibraries(a, b)).toHaveLength(2);
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

  // The chain from the review: three records share an identifier, and a fourth
  // reaches one of them by title and year. All four are transitively one film.
  const chain: Film[] = [
    film({ title: 'Matrix, The', imdbId: 'tt1', year: 1999, rating: 70 }),
    film({ title: 'Matrix', imdbId: 'tt1', year: 1999, rating: 90 }),
    film({ title: 'Something Else', imdbId: 'tt1', year: 1999, runtimeMinutes: 136 }),
    film({ title: 'Matrix', imdbId: null, year: 1999, source: 'letterboxd', rating: 80 }),
  ];

  it('clusters a transitive chain in every order the libraries can arrive in', () => {
    const failures: string[] = [];

    for (const order of permutations(chain)) {
      const result = mergeLibraries(...order.map((one) => [one]));
      if (result.length !== 1 || result[0]?.imdbId !== 'tt1') {
        failures.push(
          `${order.map((one) => one.title).join(' | ')} => ${result.length} film(s), ` +
            `imdbId=${String(result[0]?.imdbId)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it('clusters a transitive chain in every order the records can arrive in', () => {
    const failures: string[] = [];

    for (const order of permutations(chain)) {
      const result = mergeLibraries(order);
      if (result.length !== 1 || result[0]?.imdbId !== 'tt1') {
        failures.push(
          `${order.map((one) => one.title).join(' | ')} => ${result.length} film(s), ` +
            `imdbId=${String(result[0]?.imdbId)}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it('returns an identical library however the records are split and ordered', () => {
    // Six records forming three clusters: a transitive chain, a pair matched by
    // title alone, and a lone record no other one touches.
    const records: Film[] = [
      film({
        title: 'The Matrix',
        imdbId: 'tt0133093',
        year: 1999,
        rating: 90,
        genres: ['Action'],
      }),
      film({ title: 'Matrix, The', imdbId: 'tt0133093', year: 1999 }),
      film({
        title: 'The Matrix',
        imdbId: null,
        year: 1999,
        source: 'letterboxd',
        isRewatch: true,
      }),
      film({ title: 'Amélie', imdbId: null, year: 2001, runtimeMinutes: 122 }),
      film({ title: 'Amelie', imdbId: null, year: 2001, source: 'letterboxd', rating: 80 }),
      film({ title: 'Dune', imdbId: 'tt0087182', year: 1984 }),
    ];

    const expected = mergeLibraries(records);
    expect(expected).toHaveLength(3);

    for (const order of permutations(records)) {
      expect(mergeLibraries(order)).toEqual(expected);
      expect(mergeLibraries(...order.map((one) => [one]))).toEqual(expected);
      expect(mergeLibraries(order.slice(0, 2), order.slice(2, 4), order.slice(4))).toEqual(
        expected,
      );
    }
  });

  it('keeps every field when three records are chained by identifier and title', () => {
    const x = [
      film({ title: 'Foo', year: 2000, imdbId: 'ttX', genres: ['Drama'], runtimeMinutes: 120 }),
    ];
    const y = [film({ title: 'Bar', year: 2000, imdbId: null, source: 'letterboxd', rating: 80 })];
    const z = [
      film({ title: 'Bar', year: 2000, imdbId: 'ttX', watchedAt: new Date('2024-01-01') }),
    ];

    const result = mergeLibraries(x, y, z);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      imdbId: 'ttX',
      genres: ['Drama'],
      runtimeMinutes: 120,
      rating: 80,
    });
    expect(result[0]?.watchedAt).toEqual(new Date('2024-01-01'));
  });

  it('remembers that details were fetched, whichever record carries the flag', () => {
    // Both directions, deliberately. With the IMDb record as the merge base, an
    // implementation that simply kept `base.detailsFetched` would pass the first
    // case and fail the second — which is the whole point of the OR.
    const fromImdb = mergeLibraries(
      [film({ title: 'Heat', year: 1995, imdbId: 'tt0113277', detailsFetched: true })],
      [film({ title: 'Heat', year: 1995, imdbId: null, source: 'letterboxd' })],
    );
    expect(fromImdb).toHaveLength(1);
    expect(fromImdb[0]!.detailsFetched).toBe(true);

    const fromLetterboxd = mergeLibraries(
      [film({ title: 'Heat', year: 1995, imdbId: 'tt0113277' })],
      [
        film({
          title: 'Heat',
          year: 1995,
          imdbId: null,
          source: 'letterboxd',
          detailsFetched: true,
        }),
      ],
    );
    expect(fromLetterboxd).toHaveLength(1);
    expect(fromLetterboxd[0]!.detailsFetched).toBe(true);
  });

  it('leaves detailsFetched false when neither record was enriched', () => {
    const merged = mergeLibraries(
      [film({ title: 'Heat', year: 1995, imdbId: 'tt0113277' })],
      [film({ title: 'Heat', year: 1995, imdbId: null, source: 'letterboxd' })],
    );
    expect(merged[0]!.detailsFetched).toBe(false);
  });
});

describe('mergeLibraries on real exports', () => {
  const imdb = parseImdbRatings(readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8')).films;
  const letterboxd = parseLetterboxdExport({
    diary: readFileSync('tests/fixtures/letterboxd-diary.csv', 'utf8'),
    ratings: readFileSync('tests/fixtures/letterboxd-ratings.csv', 'utf8'),
    watched: readFileSync('tests/fixtures/letterboxd-watched.csv', 'utf8'),
  }).films;

  it('folds the two exports into one library, whichever order they arrive in', () => {
    const forward = mergeLibraries(imdb, letterboxd);
    const backward = mergeLibraries(letterboxd, imdb);

    // 6 IMDb titles (five films and a series) + 5 Letterboxd films, with one pair
    // sharing an identity.
    expect(forward).toHaveLength(10);
    expect(backward).toEqual(forward);
  });

  it('keeps the two Dune releases apart', () => {
    const dune = mergeLibraries(imdb, letterboxd).filter((one) => one.title === 'Dune');
    expect(dune.map((one) => one.year).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1984, 2021]);
  });

  it('takes metadata from IMDb and watch history from Letterboxd', () => {
    const matrix = mergeLibraries(imdb, letterboxd).find((one) => one.imdbId === 'tt0133093');

    expect(matrix?.genres).toEqual(['Action', 'Sci-Fi']);
    expect(matrix?.watchedAt).toEqual(new Date('2025-03-09'));
    expect(matrix?.watchedAtIsApproximate).toBe(false);
    expect(matrix?.isRewatch).toBe(true);
  });
});

describe('mergeLibraries on title types', () => {
  it('keeps a series a series, whichever library it is merged into', () => {
    // Letterboxd calls everything a film because it catalogues nothing else, so
    // its claim must not overwrite the type IMDb actually assigned.
    const imdb = film({ title: 'Fargo', year: 2014, titleType: 'series', imdbId: 'tt2802850' });
    const letterboxd = film({ title: 'Fargo', year: 2014, titleType: 'movie', id: 'lb:fargo' });

    expect(mergeLibraries([imdb], [letterboxd])[0]!.titleType).toBe('series');
    expect(mergeLibraries([letterboxd], [imdb])[0]!.titleType).toBe('series');
  });

  it('lets any recognized type displace an unclassifiable one', () => {
    // The unclassifiable record is the one without an IMDb id, so it is the record
    // the merge builds on: if specificity did not lift it, 'other' would survive.
    const unknown = film({ title: 'Solaris', year: 1972, titleType: 'other', id: 'lb:solaris' });
    const classified = film({
      title: 'Solaris',
      year: 1972,
      titleType: 'movie',
      imdbId: 'tt0069293',
    });

    expect(mergeLibraries([unknown], [classified])[0]!.titleType).toBe('movie');
    expect(mergeLibraries([classified], [unknown])[0]!.titleType).toBe('movie');
  });
});
