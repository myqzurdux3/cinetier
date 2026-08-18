import type { Film } from './film';
import { normalizeTitle } from './normalize';

/**
 * Combine one record of the same film from two services.
 * Watch history comes from whichever record has a precise date; metadata comes
 * from whichever record actually has it. Neither service is authoritative for both.
 */
function mergeFilm(base: Film, incoming: Film): Film {
  const incomingHasBetterDate =
    incoming.watchedAt !== null &&
    (base.watchedAt === null || (base.watchedAtIsApproximate && !incoming.watchedAtIsApproximate));

  return {
    ...base,
    imdbId: base.imdbId ?? incoming.imdbId,
    tmdbId: base.tmdbId ?? incoming.tmdbId,
    year: base.year ?? incoming.year,
    rating: base.rating ?? incoming.rating,
    ratingScale: base.rating !== null ? base.ratingScale : incoming.ratingScale,
    watchedAt: incomingHasBetterDate ? incoming.watchedAt : base.watchedAt,
    watchedAtIsApproximate: incomingHasBetterDate
      ? incoming.watchedAtIsApproximate
      : base.watchedAtIsApproximate,
    isRewatch: base.isRewatch || incoming.isRewatch,
    genres: base.genres.length > 0 ? base.genres : incoming.genres,
    directors: base.directors.length > 0 ? base.directors : incoming.directors,
    runtimeMinutes: base.runtimeMinutes ?? incoming.runtimeMinutes,
    publicRating: base.publicRating ?? incoming.publicRating,
    posterPath: base.posterPath ?? incoming.posterPath,
  };
}

/**
 * Compute all candidate keys for a film.
 * The spec says: match on IMDb identifier when both sides have one, otherwise on
 * normalized title plus year. Since we don't know what the other side has yet, we
 * compute both keys and look up incoming films under both.
 */
function getCandidateKeys(film: Pick<Film, 'imdbId' | 'title' | 'year'>): string[] {
  const keys: string[] = [];
  if (film.imdbId) {
    keys.push(`imdb:${film.imdbId}`);
  }
  keys.push(`title:${normalizeTitle(film.title)}::${film.year ?? 'unknown'}`);
  return keys;
}

/** Combine any number of imported libraries into one, without duplicate films. */
export function mergeLibraries(...libraries: Film[][]): Film[] {
  const byKey = new Map<string, Film>();

  for (const library of libraries) {
    for (const film of library) {
      // Determine which keys to use for MATCHING existing films.
      // If the incoming film has an IMDb ID, match ONLY by that ID to avoid
      // false positives from title collisions. Otherwise, match by title+year.
      const matchKeys: string[] = [];
      if (film.imdbId) {
        matchKeys.push(`imdb:${film.imdbId}`);
      } else {
        matchKeys.push(`title:${normalizeTitle(film.title)}::${film.year ?? 'unknown'}`);
      }

      // Collect all existing films reachable by match keys
      const existingFilms = new Set<Film>();
      for (const key of matchKeys) {
        const existing = byKey.get(key);
        if (existing) {
          existingFilms.add(existing);
        }
      }

      // Determine keys we'll register under
      const registerKeys = getCandidateKeys(film);

      // CRITICAL: Before registering, check if any of these keys already have
      // different films. If so, we must include those films in the merge to avoid
      // silently losing them and to ensure consistent results regardless of order.
      // This handles the case where film A connects two previously separate films.
      for (const key of registerKeys) {
        const occupant = byKey.get(key);
        if (occupant && !existingFilms.has(occupant)) {
          existingFilms.add(occupant);
        }
      }

      // Collect all keys for all existing films (including newly discovered ones)
      const keysToDelete = new Set<string>();
      if (existingFilms.size > 0) {
        for (const [key, value] of byKey.entries()) {
          if (existingFilms.has(value)) {
            keysToDelete.add(key);
          }
        }
      }

      // Merge all collected films with the incoming film
      let merged = film;
      for (const existing of existingFilms) {
        merged = mergeFilm(existing, merged);
      }

      // Delete old keys
      for (const key of keysToDelete) {
        byKey.delete(key);
      }

      // Re-register under the union of all keys from all merged films.
      // This ensures that future films can find the merged result regardless
      // of how their titles are formatted (title normalization variations).
      const allKeysFromMerge = new Set<string>();
      for (const key of getCandidateKeys(film)) {
        allKeysFromMerge.add(key);
      }
      for (const existing of existingFilms) {
        for (const key of getCandidateKeys(existing)) {
          allKeysFromMerge.add(key);
        }
      }
      for (const key of allKeysFromMerge) {
        byKey.set(key, merged);
      }
    }
  }

  return [...new Set(byKey.values())];
}

// DEBUG: Temporary logging
if (process.env.DEBUG_DEDUPE) {
  console.log('[dedupe] Module loaded');
}
