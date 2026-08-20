import type { Film } from './film';
import { TITLE_TYPE_LABELS } from './titleType';
import type { TitleType } from './titleType';

export interface FilterCriteria {
  /** Keep only these kinds of title, e.g. ['movie'] for a films-only tier list. */
  titleTypes?: TitleType[];
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
    titleTypes,
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

  if (titleTypes?.length && !titleTypes.includes(film.titleType)) return false;

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

/** The kinds of title actually present, so the filter rail offers no empty option. */
export function availableTitleTypes(films: Film[]): TitleType[] {
  return [...new Set(films.map((film) => film.titleType))];
}

/** Decade start years present in the library, ascending: [1980, 1990]. */
export function availableDecades(films: Film[]): number[] {
  const decades = new Set<number>();
  for (const film of films) {
    if (film.year === null) continue;
    decades.add(Math.floor(film.year / 10) * 10);
  }
  return [...decades].sort((a, b) => a - b);
}

/**
 * The runtimes the library spans, or null when nothing carries one — which is
 * every Letterboxd import until the details pass has run.
 */
export function runtimeBounds(films: Film[]): { min: number; max: number } | null {
  const runtimes = films
    .map((film) => film.runtimeMinutes)
    .filter((runtime): runtime is number => runtime !== null);
  if (runtimes.length === 0) return null;
  return { min: Math.min(...runtimes), max: Math.max(...runtimes) };
}

export type CriterionKey = keyof FilterCriteria;

/**
 * Wraps an array literal with a compile-time proof that it names every
 * member of T at least once. Passing an array missing a member fails to
 * typecheck at the call site — the expected parameter type becomes
 * `{ missing: ... }`, naming exactly what's absent — instead of compiling
 * silently and letting that member vanish from whatever the array drives.
 */
function exhaustive<T extends string>() {
  return function <const Keys extends readonly T[]>(
    keys: Exclude<T, Keys[number]> extends never ? Keys : { missing: Exclude<T, Keys[number]> },
  ): Keys {
    return keys as Keys;
  };
}

/**
 * Every criterion, in a deliberately curated presentation order (not
 * FilterCriteria's declaration order). Chips follow it, and
 * mostRestrictiveCriterion breaks ties with it, so two libraries in the same
 * state always produce the same words in the same order.
 *
 * Exported, and wrapped in `exhaustive`, so a criterion added to
 * FilterCriteria without also being added here fails to build rather than
 * silently dropping out of activeCriteria, chip ordering, and — via the
 * filter rail's own section-completeness check, which treats this list as
 * the full criterion set — out of the rail entirely.
 */
export const CRITERION_ORDER = exhaustive<CriterionKey>()([
  'titleTypes',
  'decades',
  'minRating',
  'maxRating',
  'onlyUnrated',
  'minRatingDelta',
  'maxRatingDelta',
  'genres',
  'directors',
  'minRuntimeMinutes',
  'maxRuntimeMinutes',
  'watchedAfter',
  'watchedBefore',
  'onlyRewatches',
  'topN',
]);

/**
 * Whether a criterion is actually filtering anything.
 *
 * The controls write `undefined` to clear a bound and `false` to clear a
 * checkbox rather than deleting keys, so "the key is present" is not the same
 * question. A numeric zero is a real bound and stays active.
 */
export function isCriterionActive(criteria: FilterCriteria, key: CriterionKey): boolean {
  const value = criteria[key];
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return true;
}

export function activeCriteria(criteria: FilterCriteria): CriterionKey[] {
  return CRITERION_ORDER.filter((key) => isCriterionActive(criteria, key));
}

export function withoutCriterion(criteria: FilterCriteria, key: CriterionKey): FilterCriteria {
  const next = { ...criteria };
  delete next[key];
  return next;
}

/** The active part of `criteria` restricted to `keys` — one section's own share. */
export function subsetCriteria(
  criteria: FilterCriteria,
  keys: readonly CriterionKey[],
): FilterCriteria {
  const next: FilterCriteria = {};
  for (const key of keys) {
    if (!isCriterionActive(criteria, key)) continue;
    // Each key carries its own value type and TypeScript cannot narrow a
    // dynamic key to it; the copy is value-preserving by construction.
    (next as Record<string, unknown>)[key] = criteria[key];
  }
  return next;
}

/** ISO calendar date in local time — never a locale format, which reads differently per reader. */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** What a chip for this criterion says. Assumes the criterion is active. */
export function describeCriterion(key: CriterionKey, criteria: FilterCriteria): string {
  switch (key) {
    case 'titleTypes':
      return `Type: ${(criteria.titleTypes ?? []).map((type) => TITLE_TYPE_LABELS[type].many).join(', ')}`;
    case 'decades':
      return `Decade: ${(criteria.decades ?? []).map((decade) => `${decade}s`).join(', ')}`;
    case 'minRating':
      return `Rating ${criteria.minRating} or more`;
    case 'maxRating':
      return `Rating ${criteria.maxRating} or less`;
    case 'onlyUnrated':
      return 'Unrated only';
    case 'minRatingDelta':
      return `${criteria.minRatingDelta} or more above the public score`;
    case 'maxRatingDelta':
      return `${Math.abs(criteria.maxRatingDelta ?? 0)} or more below the public score`;
    case 'genres':
      return `Genre: ${(criteria.genres ?? []).join(', ')}`;
    case 'directors':
      return `Director: ${(criteria.directors ?? []).join(', ')}`;
    case 'minRuntimeMinutes':
      return `At least ${criteria.minRuntimeMinutes} minutes`;
    case 'maxRuntimeMinutes':
      return `At most ${criteria.maxRuntimeMinutes} minutes`;
    case 'watchedAfter':
      return `Watched after ${isoDate(criteria.watchedAfter!)}`;
    case 'watchedBefore':
      return `Watched before ${isoDate(criteria.watchedBefore!)}`;
    case 'onlyRewatches':
      return 'Rewatches only';
    case 'topN':
      return `Top ${criteria.topN}`;
  }
}

/**
 * The active criterion whose removal would admit the most films, or null when
 * no single removal admits any — two criteria can exclude everything between
 * them with neither one to blame, and naming an innocent control is worse than
 * saying so.
 */
export function mostRestrictiveCriterion(
  films: Film[],
  criteria: FilterCriteria,
): CriterionKey | null {
  const active = activeCriteria(criteria);
  if (active.length === 0) return null;

  const current = applyFilters(films, criteria).length;
  let best: CriterionKey | null = null;
  let bestGain = 0;

  for (const key of active) {
    const gain = applyFilters(films, withoutCriterion(criteria, key)).length - current;
    // Strictly greater, so a tie goes to whichever comes first in
    // CRITERION_ORDER rather than to the last one examined.
    if (gain > bestGain) {
      bestGain = gain;
      best = key;
    }
  }

  return best;
}
