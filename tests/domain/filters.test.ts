import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  availableGenres,
  availableDirectors,
  availableTitleTypes,
  availableDecades,
  runtimeBounds,
  activeCriteria,
  withoutCriterion,
  subsetCriteria,
  describeCriterion,
  mostRestrictiveCriterion,
} from '@/domain/filters';
import type { Film } from '@/domain/film';
import type { FilterCriteria } from '@/domain/filters';

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

describe('activeCriteria', () => {
  it('ignores keys that are absent, undefined, empty, or false', () => {
    // Every control writes `undefined` rather than deleting a key, and an
    // unchecked box writes `false`. None of those is a filter, and treating one
    // as active would light up the clear-all action over an unfiltered library.
    const criteria: FilterCriteria = {
      minRating: undefined,
      genres: [],
      onlyUnrated: false,
      titleTypes: ['movie'],
      topN: 25,
    };
    expect(activeCriteria(criteria)).toEqual(['titleTypes', 'topN']);
  });

  it('counts a zero bound as active, because zero is a bound', () => {
    expect(activeCriteria({ minRating: 0 })).toEqual(['minRating']);
  });
});

describe('withoutCriterion', () => {
  it('removes exactly the named criterion', () => {
    const criteria: FilterCriteria = { minRating: 80, genres: ['Drama'], topN: 10 };
    const result = withoutCriterion(criteria, 'genres');
    expect(result).toEqual({ minRating: 80, topN: 10 });
    // toEqual treats an undefined-valued property as equivalent to an absent
    // one, so it would not catch `next[key] = undefined` in place of `delete
    // next[key]`. This checks the key is truly gone, not just undefined.
    expect(Object.hasOwn(result, 'genres')).toBe(false);
  });

  it('leaves the original untouched', () => {
    const criteria: FilterCriteria = { minRating: 80 };
    withoutCriterion(criteria, 'minRating');
    expect(criteria.minRating).toBe(80);
  });
});

describe('subsetCriteria', () => {
  it('keeps only the named keys, and only when they are active', () => {
    const criteria: FilterCriteria = {
      minRating: 80,
      maxRating: undefined,
      genres: ['Drama'],
    };
    const result = subsetCriteria(criteria, ['minRating', 'maxRating']);
    expect(result).toEqual({ minRating: 80 });
    // toEqual treats an undefined-valued property as equivalent to an absent
    // one, so it alone would not catch an implementation that copied
    // maxRating: undefined across unconditionally. Assert the key is truly
    // absent, not merely undefined.
    expect(Object.hasOwn(result, 'maxRating')).toBe(false);
  });

  it('excludes an inactive key even when its value is falsy but not undefined', () => {
    // false and [] are real, present values that toEqual would not equate to
    // absence — unlike the maxRating: undefined case above, an implementation
    // that dropped the isCriterionActive guard would fail this one directly.
    const criteria: FilterCriteria = { onlyUnrated: false, genres: [], minRating: 80 };
    const result = subsetCriteria(criteria, ['onlyUnrated', 'genres', 'minRating']);
    expect(result).toEqual({ minRating: 80 });
    expect(Object.hasOwn(result, 'onlyUnrated')).toBe(false);
    expect(Object.hasOwn(result, 'genres')).toBe(false);
  });
});

describe('describeCriterion', () => {
  it('names each criterion in the words the chip shows', () => {
    expect(describeCriterion('minRating', { minRating: 80 })).toBe('Rating 80 or more');
    expect(describeCriterion('maxRating', { maxRating: 60 })).toBe('Rating 60 or less');
    expect(describeCriterion('onlyUnrated', { onlyUnrated: true })).toBe('Unrated only');
    expect(describeCriterion('genres', { genres: ['Drama', 'Crime'] })).toBe('Genre: Drama, Crime');
    expect(describeCriterion('directors', { directors: ['Michael Mann'] })).toBe(
      'Director: Michael Mann',
    );
    expect(describeCriterion('decades', { decades: [1980, 1990] })).toBe('Decade: 1980s, 1990s');
    expect(describeCriterion('titleTypes', { titleTypes: ['movie', 'series'] })).toBe(
      'Type: films, series',
    );
    expect(describeCriterion('minRuntimeMinutes', { minRuntimeMinutes: 90 })).toBe(
      'At least 90 minutes',
    );
    expect(describeCriterion('maxRuntimeMinutes', { maxRuntimeMinutes: 120 })).toBe(
      'At most 120 minutes',
    );
    expect(describeCriterion('onlyRewatches', { onlyRewatches: true })).toBe('Rewatches only');
    expect(describeCriterion('topN', { topN: 50 })).toBe('Top 50');
  });

  it('writes dates in an unambiguous order, not the machine locale', () => {
    // A test that formatted through toLocaleDateString would pass on the author's
    // machine and fail in CI, or worse, pass in both while showing 03/09 to a
    // reader who reads it as September.
    expect(describeCriterion('watchedAfter', { watchedAfter: new Date(2024, 0, 31) })).toBe(
      'Watched after 2024-01-31',
    );
    expect(describeCriterion('watchedBefore', { watchedBefore: new Date(2025, 11, 1) })).toBe(
      'Watched before 2025-12-01',
    );
  });

  it('states a rating delta in the direction the reader set it', () => {
    // maxRatingDelta is stored negative — "delta at most -10" is "10 below the
    // public score" — and a chip reading "-10" would be unreadable.
    expect(describeCriterion('minRatingDelta', { minRatingDelta: 10 })).toBe(
      '10 or more above the public score',
    );
    expect(describeCriterion('maxRatingDelta', { maxRatingDelta: -10 })).toBe(
      '10 or more below the public score',
    );
  });
});

describe('mostRestrictiveCriterion', () => {
  const library = [
    film({ title: 'A', rating: 95, genres: ['Drama'] }),
    film({ title: 'B', rating: 40, genres: ['Drama'] }),
    film({ title: 'C', rating: 30, genres: ['Comedy'] }),
    film({ title: 'D', rating: 20, genres: ['Comedy'] }),
  ];

  it('names the criterion whose removal admits the most films', () => {
    // minRating 90 alone admits one film; genres ['Drama'] alone admits two.
    // Together they admit one, so removing minRating gains one and removing
    // genres gains nothing.
    expect(mostRestrictiveCriterion(library, { minRating: 90, genres: ['Drama'] })).toBe(
      'minRating',
    );
  });

  it('names the other one when the balance reverses', () => {
    expect(mostRestrictiveCriterion(library, { minRating: 20, genres: ['Comedy'] })).toBe('genres');
  });

  it('reports nothing when no single removal admits another film', () => {
    // Two criteria that each exclude everything on their own: removing either
    // leaves the other still admitting nothing, so there is no one culprit to
    // name and the screen must say so instead of blaming an innocent control.
    expect(mostRestrictiveCriterion(library, { minRating: 99, genres: ['Western'] })).toBeNull();
  });

  it('reports nothing when nothing is filtered', () => {
    expect(mostRestrictiveCriterion(library, {})).toBeNull();
  });
});
