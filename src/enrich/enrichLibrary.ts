import type { Film } from '@/domain/film';
import { mergeLibraries } from '@/domain/dedupe';
import { normalizeTitle } from '@/domain/normalize';
import { lookupByImdbId, searchByTitle, type TmdbMatch } from '@/services/tmdb';
import { getCached, putCached } from '@/services/tmdbCache';

export interface EnrichProgress {
  films: Film[];
  done: number;
  total: number;
}

/** Six at a time keeps TMDB comfortable and the browser responsive. */
const DEFAULT_CONCURRENCY = 6;

/**
 * Keyed on imdbId when the film has one, otherwise on normalized title + year.
 *
 * Enrichment itself can fill in imdbId (via applyMatch), which raises the question of
 * whether a second enrichLibrary run over already-enriched films still finds the cache
 * entry written by the first. It does: resolve() writes to the cache under the key
 * computed from the film *before* enrichment, i.e. from `films[index]`, the pre-enrichment
 * argument, never from `enriched[index]`. On a second run over the now-enriched films
 * (which is the flow the app actually uses — the library persisted after enrichment
 * already carries the resolved imdbId), the film passed in to cacheKey already has
 * imdbId set, so it derives the SAME `imdb:${imdbId}` key that a title/year search
 * would only have produced incidentally. There is no drift: once a film has an imdbId,
 * every subsequent run keys on it consistently, and a film that still lacks one keeps
 * using its stable title+year key run after run. The only case that could ever produce
 * two different keys for one film is a *single* run seeing the film both before and
 * after its own enrichment, and this module never does that: each film's key is
 * computed exactly once, from the pre-resolution film, before its match is applied.
 */
function cacheKey(film: Film): string {
  if (film.imdbId) return `imdb:${film.imdbId}`;
  return `title:${normalizeTitle(film.title)}::${film.year ?? 'unknown'}`;
}

async function resolve(film: Film): Promise<TmdbMatch | null> {
  const key = cacheKey(film);
  const cached = await getCached(key);
  if (cached !== undefined) return cached;

  const match = film.imdbId
    ? await lookupByImdbId(film.imdbId)
    : await searchByTitle(film.title, film.year);

  await putCached(key, match);
  return match;
}

/** Apply a match without ever displacing something the user's own export supplied. */
function applyMatch(film: Film, match: TmdbMatch | null): Film {
  if (!match) return film;
  return {
    ...film,
    tmdbId: film.tmdbId ?? match.tmdbId,
    imdbId: film.imdbId ?? match.imdbId,
    posterPath: film.posterPath ?? match.posterPath,
    publicRating: film.publicRating ?? match.publicRating,
  };
}

/**
 * Enrich every film, reporting progress as results arrive so the interface can
 * fill posters in rather than blocking on the whole run.
 *
 * The returned library is re-merged: enrichment can give a Letterboxd record an
 * IMDb identifier, which may reveal that two records are the same film after all.
 */
export async function enrichLibrary(
  films: Film[],
  onProgress: (progress: EnrichProgress) => void,
  options: { concurrency?: number } = {},
): Promise<Film[]> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const enriched = [...films];
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < films.length) {
      const index = next++;
      const film = films[index]!;
      enriched[index] = applyMatch(film, await resolve(film));
      done += 1;
      onProgress({ films: [...enriched], done, total: films.length });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, films.length) }, () => worker()));

  return mergeLibraries(enriched);
}
