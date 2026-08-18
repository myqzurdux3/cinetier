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
      const candidateKeys = getCandidateKeys(film);

      // Look for an existing film under any of the candidate keys
      let existing: Film | undefined;
      let existingKey: string | undefined;
      for (const key of candidateKeys) {
        const found = byKey.get(key);
        if (found) {
          existing = found;
          existingKey = key;
          break;
        }
      }

      const merged = existing ? mergeFilm(existing, film) : film;

      // If we found an existing film, remove it from all keys it was registered under
      if (existing && existingKey) {
        for (const [key, value] of byKey.entries()) {
          if (value === existing) {
            byKey.delete(key);
          }
        }
      }

      // Register the merged film under all applicable keys
      for (const key of candidateKeys) {
        byKey.set(key, merged);
      }
    }
  }

  return [...new Set(byKey.values())];
}
