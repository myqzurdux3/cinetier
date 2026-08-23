import type { Film } from '@/domain/film';
import type { TitleType } from '@/domain/titleType';
import { fetchMovieDetails, fetchTvDetails, type TmdbDetails } from '@/services/tmdb';
import { getCachedDetails, putCachedDetails } from '@/services/tmdbDetailsCache';

export interface DetailsProgress {
  films: Film[];
  done: number;
  total: number;
}

/** Same as the poster pass: six at a time. */
const DEFAULT_CONCURRENCY = 6;

/**
 * The kinds TMDB files under /tv. Everything else — films, television films,
 * shorts, and anything we could not classify — is a /movie.
 *
 * Episodes are absent on purpose, but that only holds for the records with an
 * imdbId: `lookupByImdbId` (services/tmdb.ts) reads `movie_results` and
 * `tv_results` only, so an episode looked up that way never comes back with a
 * tmdbId. An episode with no imdbId is matched by `searchByTitle` instead
 * (enrichLibrary.ts) and can pick up a tmdbId, reaching this pass after all.
 * Harmless either way — TELEVISION not listing 'episode' just means it falls
 * back to the /movie endpoint below, the same as anything else unclassified.
 */
const TELEVISION: ReadonlySet<TitleType> = new Set<TitleType>(['series', 'miniSeries']);

function needsDetails(film: Film): boolean {
  return film.tmdbId !== null && !film.detailsFetched;
}

/** How much work the pass has to do, so the interface can say so before it starts. */
export function countPendingDetails(films: Film[]): number {
  return films.filter(needsDetails).length;
}

async function resolveDetails(film: Film): Promise<TmdbDetails | null> {
  const tmdbId = film.tmdbId;
  if (tmdbId === null) return null;

  const kind = TELEVISION.has(film.titleType) ? 'tv' : 'movie';
  // The same numeric id names a different title in each of TMDB's two
  // catalogues, so the kind is part of the key rather than a detail of it.
  const key = `${kind}:${tmdbId}`;

  const cached = await getCachedDetails(key);
  if (cached !== undefined) return cached;

  const details = kind === 'tv' ? await fetchTvDetails(tmdbId) : await fetchMovieDetails(tmdbId);
  await putCachedDetails(key, details);
  return details;
}

/**
 * Apply what TMDB said without ever displacing what the user's own export
 * supplied — the same rule the poster pass follows.
 *
 * A null means the request failed, and the film stays unmarked so a later visit
 * tries again. An answer of nothing still marks it: "asked, and there are none"
 * is a real answer, and it is what lets the rail tell an empty genre list from
 * an unasked question.
 */
function applyDetails(film: Film, details: TmdbDetails | null): Film {
  if (!details) return film;
  return {
    ...film,
    genres: film.genres.length > 0 ? film.genres : details.genres,
    directors: film.directors.length > 0 ? film.directors : details.directors,
    runtimeMinutes: film.runtimeMinutes ?? details.runtimeMinutes,
    detailsFetched: true,
  };
}

/**
 * Fill in genres, directors and runtimes for every film that has a TMDB id and
 * no details yet.
 *
 * Unlike the poster pass this does not re-merge the library: it adds no
 * identifier, so it cannot reveal that two records were the same film.
 */
export async function enrichDetails(
  films: Film[],
  onProgress: (progress: DetailsProgress) => void,
  options: { concurrency?: number } = {},
): Promise<Film[]> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const enriched = [...films];
  const pending = films
    .map((film, index) => ({ film, index }))
    .filter(({ film }) => needsDetails(film));

  const total = pending.length;
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < pending.length) {
      const entry = pending[next++]!;
      enriched[entry.index] = applyDetails(entry.film, await resolveDetails(entry.film));
      done += 1;
      onProgress({ films: [...enriched], done, total });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));

  return enriched;
}
