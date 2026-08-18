import type { Film } from './film';
import { matchKey } from './normalize';

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

/** Combine any number of imported libraries into one, without duplicate films. */
export function mergeLibraries(...libraries: Film[][]): Film[] {
  const byKey = new Map<string, Film>();

  for (const library of libraries) {
    for (const film of library) {
      const key = matchKey(film);
      const existing = byKey.get(key);
      byKey.set(key, existing ? mergeFilm(existing, film) : film);
    }
  }

  return [...byKey.values()];
}
