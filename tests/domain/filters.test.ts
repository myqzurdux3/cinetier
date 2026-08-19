import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  availableGenres,
  availableDirectors,
  availableTitleTypes,
  availableDecades,
  runtimeBounds,
} from '@/domain/filters';
import type { Film } from '@/domain/film';

function film(overrides: Partial<Film> & Pick<Film, 'title'>): Film {
  return {
    id: `test:${overrides.title}`,
    imdbId: null,
    tmdbId: null,
    year: 1999,
    titleType: 'movie',
    rating: 70,
    ratingScale: 'imdb10',
    watchedAt: new Date('2024-06-15'),
    watchedAtIsApproximate: false,
    isRewatch: false,
    genres: [],
    directors: [],
    runtimeMinutes: 120,
    publicRating: 70,
    posterPath: null,
    detailsFetched: false,
    source: 'imdb',
    ...overrides,
  };
}

const library: Film[] = [
  film({
    title: 'Loved',
    rating: 100,
    genres: ['Drama'],
    directors: ['Bong Joon-ho'],
    watchedAt: new Date('2025-02-01'),
    publicRating: 80,
    runtimeMinutes: 132,
  }),
  film({
    title: 'Liked',
    rating: 80,
    genres: ['Action'],
    directors: ['Christopher Nolan'],
    watchedAt: new Date('2024-05-01'),
    publicRating: 90,
    runtimeMinutes: 150,
  }),
  film({
    title: 'Meh',
    rating: 50,
    genres: ['Comedy'],
    directors: ['Christopher Nolan'],
    watchedAt: new Date('2023-03-01'),
    publicRating: 60,
    runtimeMinutes: 95,
    isRewatch: true,
  }),
  film({
    title: 'Unrated',
    rating: null,
    genres: ['Horror'],
    directors: [],
    watchedAt: new Date('2025-01-01'),
    publicRating: null,
    runtimeMinutes: 88,
  }),
];

describe('applyFilters', () => {
  it('returns everything when no criteria are set', () => {
    expect(applyFilters(library, {})).toHaveLength(4);
  });

  it('filters by minimum rating and excludes unrated films', () => {
    const result = applyFilters(library, { minRating: 80 });
    expect(result.map((f) => f.title)).toEqual(['Loved', 'Liked']);
  });

  it('keeps only unrated films when asked', () => {
    expect(applyFilters(library, { onlyUnrated: true }).map((f) => f.title)).toEqual(['Unrated']);
  });

  it('combines onlyUnrated with a genre filter', () => {
    const withComedy = [
      ...library,
      film({ title: 'Unrated Comedy', rating: null, genres: ['Comedy'], publicRating: null }),
    ];
    const result = applyFilters(withComedy, { onlyUnrated: true, genres: ['Horror'] });
    expect(result.map((f) => f.title)).toEqual(['Unrated']);
  });

  it('combines onlyUnrated with a runtime filter', () => {
    const result = applyFilters(library, { onlyUnrated: true, maxRuntimeMinutes: 80 });
    expect(result.map((f) => f.title)).toEqual([]);
  });

  it('filters by watch date range', () => {
    const result = applyFilters(library, { watchedAfter: new Date('2025-01-01') });
    expect(result.map((f) => f.title).sort()).toEqual(['Loved', 'Unrated']);
  });

  it('filters by genre, matching any selected genre', () => {
    const result = applyFilters(library, { genres: ['Drama', 'Horror'] });
    expect(result.map((f) => f.title).sort()).toEqual(['Loved', 'Unrated']);
  });

  it('filters by director', () => {
    const result = applyFilters(library, { directors: ['Christopher Nolan'] });
    expect(result.map((f) => f.title)).toEqual(['Liked', 'Meh']);
  });

  it('filters by decade of release', () => {
    const withOld = [...library, film({ title: 'Old', year: 1985 })];
    expect(applyFilters(withOld, { decades: [1980] }).map((f) => f.title)).toEqual(['Old']);
  });

  it('filters by runtime', () => {
    const result = applyFilters(library, { maxRuntimeMinutes: 100 });
    expect(result.map((f) => f.title).sort()).toEqual(['Meh', 'Unrated']);
  });

  it('filters by minimum runtime', () => {
    const result = applyFilters(library, { minRuntimeMinutes: 100 });
    expect(result.map((f) => f.title).sort()).toEqual(['Liked', 'Loved']);
  });

  it('filters by maximum rating', () => {
    const result = applyFilters(library, { maxRating: 60 });
    expect(result.map((f) => f.title)).toEqual(['Meh']);
  });

  it('filters by watch date up to a cutoff', () => {
    const result = applyFilters(library, { watchedBefore: new Date('2024-01-01') });
    expect(result.map((f) => f.title)).toEqual(['Meh']);
  });

  it('filters by rewatch status', () => {
    expect(applyFilters(library, { onlyRewatches: true }).map((f) => f.title)).toEqual(['Meh']);
  });

  it('finds films the user rated far above the public', () => {
    // Loved: 100 vs 80 = +20. Meh: 50 vs 60 = -10.
    const result = applyFilters(library, { minRatingDelta: 15 });
    expect(result.map((f) => f.title)).toEqual(['Loved']);
  });

  it('finds films the user rated far below the public', () => {
    const result = applyFilters(library, { maxRatingDelta: -5 });
    expect(result.map((f) => f.title).sort()).toEqual(['Liked', 'Meh']);
  });

  it('limits to the top N by rating, highest first', () => {
    const result = applyFilters(library, { topN: 2 });
    expect(result.map((f) => f.title)).toEqual(['Loved', 'Liked']);
  });

  it('combines criteria conjunctively', () => {
    const result = applyFilters(library, {
      minRating: 50,
      directors: ['Christopher Nolan'],
      maxRuntimeMinutes: 100,
    });
    expect(result.map((f) => f.title)).toEqual(['Meh']);
  });
});

describe('availableGenres', () => {
  it('lists every genre present, sorted and deduplicated', () => {
    const withDuplicateGenre = [...library, film({ title: 'Another Drama', genres: ['Drama'] })];
    expect(availableGenres(withDuplicateGenre)).toEqual(['Action', 'Comedy', 'Drama', 'Horror']);
  });
});

describe('availableDirectors', () => {
  it('lists every director present, sorted and deduplicated', () => {
    expect(availableDirectors(library)).toEqual(['Bong Joon-ho', 'Christopher Nolan']);
  });
});

describe('filtering by title type', () => {
  const library = [
    film({ title: 'Heat', titleType: 'movie', rating: 90 }),
    film({ title: 'Fargo', titleType: 'series', rating: 85 }),
    film({ title: 'Chernobyl', titleType: 'miniSeries', rating: 95 }),
  ];

  it('keeps only the requested kinds of title', () => {
    expect(applyFilters(library, { titleTypes: ['movie'] }).map((f) => f.title)).toEqual(['Heat']);
    expect(
      applyFilters(library, { titleTypes: ['series', 'miniSeries'] }).map((f) => f.title),
    ).toEqual(['Fargo', 'Chernobyl']);
  });

  it('combines with every other criterion rather than replacing it', () => {
    const result = applyFilters(library, { titleTypes: ['series', 'miniSeries'], minRating: 90 });
    expect(result.map((f) => f.title)).toEqual(['Chernobyl']);
  });

  it('ignores an empty list, so an untouched filter excludes nothing', () => {
    expect(applyFilters(library, { titleTypes: [] })).toHaveLength(3);
  });

  it('offers only the types the library actually holds', () => {
    expect(availableTitleTypes(library).sort()).toEqual(['miniSeries', 'movie', 'series']);
  });
});

describe('availableDecades', () => {
  it('lists each decade present once, oldest first', () => {
    const films = [
      film({ title: 'Pulp Fiction', year: 1994 }),
      film({ title: 'The Matrix', year: 1999 }),
      film({ title: 'Blade Runner', year: 1982 }),
    ];
    expect(availableDecades(films)).toEqual([1980, 1990]);
  });

  it('ignores films with no year rather than inventing a decade for them', () => {
    expect(availableDecades([film({ title: 'Unknown', year: null })])).toEqual([]);
  });
});

describe('runtimeBounds', () => {
  it('reports the shortest and the longest runtime present', () => {
    const films = [
      film({ title: 'Short', runtimeMinutes: 74 }),
      film({ title: 'Long', runtimeMinutes: 201 }),
      film({ title: 'Middle', runtimeMinutes: 120 }),
      film({ title: 'Unknown', runtimeMinutes: null }),
    ];
    expect(runtimeBounds(films)).toEqual({ min: 74, max: 201 });
  });

  it('reports nothing when no film carries a runtime', () => {
    // Which is a Letterboxd-only library before the details pass has run. The
    // Runtime section reads this to decide it has nothing to offer yet.
    expect(runtimeBounds([film({ title: 'Unknown', runtimeMinutes: null })])).toBeNull();
  });
});
