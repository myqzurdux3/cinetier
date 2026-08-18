import type { Film } from './film';

export interface FilterCriteria {
  minRating?: number;
  maxRating?: number;
  onlyUnrated?: boolean;
  watchedAfter?: Date;
  watchedBefore?: Date;
  genres?: string[];
  directors?: string[];
  /** Decade start years, e.g. [1980, 1990]. */
  decades?: number[];
  minRuntimeMinutes?: number;
  maxRuntimeMinutes?: number;
  onlyRewatches?: boolean;
  /** Keep films whose rating exceeds the public rating by at least this much. */
  minRatingDelta?: number;
  /** Keep films whose rating falls below the public rating by at least this much. */
  maxRatingDelta?: number;
  /** Keep only the highest-rated N films, applied after every other criterion. */
  topN?: number;
}

function matches(film: Film, criteria: FilterCriteria): boolean {
  const {
    minRating,
    maxRating,
    onlyUnrated,
    watchedAfter,
    watchedBefore,
    genres,
    directors,
    decades,
    minRuntimeMinutes,
    maxRuntimeMinutes,
    onlyRewatches,
    minRatingDelta,
    maxRatingDelta,
  } = criteria;

  // onlyUnrated is a criterion on the rating axis, not a short circuit: it must combine
  // conjunctively with every other criterion rather than swallowing them.
  if (onlyUnrated && film.rating !== null) return false;

  // An unrated film cannot satisfy a rating threshold, so exclude it rather than
  // treating a missing rating as zero. (When onlyUnrated is also set, film.rating is
  // already null here, so minRating/maxRating correctly exclude it too — the
  // contradictory combination falls out of this check with no special-casing.)
  if (minRating !== undefined && (film.rating === null || film.rating < minRating)) return false;
  if (maxRating !== undefined && (film.rating === null || film.rating > maxRating)) return false;

  if (watchedAfter && (!film.watchedAt || film.watchedAt < watchedAfter)) return false;
  if (watchedBefore && (!film.watchedAt || film.watchedAt > watchedBefore)) return false;

  if (genres?.length && !film.genres.some((genre) => genres.includes(genre))) return false;
  if (directors?.length && !film.directors.some((director) => directors.includes(director)))
    return false;

  if (decades?.length) {
    if (film.year === null) return false;
    if (!decades.includes(Math.floor(film.year / 10) * 10)) return false;
  }

  if (
    minRuntimeMinutes !== undefined &&
    (film.runtimeMinutes === null || film.runtimeMinutes < minRuntimeMinutes)
  )
    return false;
  if (
    maxRuntimeMinutes !== undefined &&
    (film.runtimeMinutes === null || film.runtimeMinutes > maxRuntimeMinutes)
  )
    return false;

  if (onlyRewatches && !film.isRewatch) return false;

  if (minRatingDelta !== undefined || maxRatingDelta !== undefined) {
    if (film.rating === null || film.publicRating === null) return false;
    const delta = film.rating - film.publicRating;
    if (minRatingDelta !== undefined && delta < minRatingDelta) return false;
    if (maxRatingDelta !== undefined && delta > maxRatingDelta) return false;
  }

  return true;
}

/** Apply every set criterion. Criteria combine conjunctively; topN is applied last. */
export function applyFilters(films: Film[], criteria: FilterCriteria): Film[] {
  const filtered = films.filter((film) => matches(film, criteria));

  if (criteria.topN === undefined) return filtered;

  return [...filtered].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)).slice(0, criteria.topN);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function availableGenres(films: Film[]): string[] {
  return uniqueSorted(films.flatMap((film) => film.genres));
}

export function availableDirectors(films: Film[]): string[] {
  return uniqueSorted(films.flatMap((film) => film.directors));
}
