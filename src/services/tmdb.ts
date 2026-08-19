import { normalizeRating } from '@/domain/rating';

export interface TmdbMatch {
  tmdbId: number;
  imdbId: string | null;
  posterPath: string | null;
  publicRating: number | null;
}

export interface TmdbDetails {
  genres: string[];
  runtimeMinutes: number | null;
  directors: string[];
}

interface TmdbMovieSummary {
  id: number;
  poster_path: string | null;
  vote_average: number;
}

const BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * TMDB reports 0 for a film nobody has rated, and can report values below 1
 * for a film with a few very low votes. normalizeRating accepts 1 to 10 only,
 * so anything outside that is an absent rating rather than a rating of zero.
 */
function toPublicRating(voteAverage: number): number | null {
  if (!Number.isFinite(voteAverage) || voteAverage < 1 || voteAverage > 10) return null;
  return normalizeRating(voteAverage, 'imdb10');
}

function toMatch(movie: TmdbMovieSummary, imdbId: string | null): TmdbMatch {
  return {
    tmdbId: movie.id,
    imdbId,
    posterPath: movie.poster_path,
    publicRating: toPublicRating(movie.vote_average),
  };
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    // A failed lookup costs a poster, never the import. Never let it propagate.
    return null;
  }
}

function key(): string {
  return import.meta.env.VITE_TMDB_API_KEY;
}

/**
 * Resolve a title by its IMDb identifier — the reliable path, when we have one.
 *
 * TMDB files films and television separately, so /find answers in two different
 * buckets. A series carries the poster and public score a film does, under the
 * same field names, so both are read: checking only movie_results would leave
 * every imported series with no artwork at all.
 */
export async function lookupByImdbId(imdbId: string): Promise<TmdbMatch | null> {
  const payload = await getJson(`${BASE}/find/${imdbId}?api_key=${key()}&external_source=imdb_id`);
  const found = payload as {
    movie_results?: TmdbMovieSummary[];
    tv_results?: TmdbMovieSummary[];
  } | null;
  const first = found?.movie_results?.[0] ?? found?.tv_results?.[0];
  return first ? toMatch(first, imdbId) : null;
}

/** Resolve a film by title and year — the fallback for Letterboxd records. */
export async function searchByTitle(title: string, year: number | null): Promise<TmdbMatch | null> {
  const params = new URLSearchParams({ api_key: key(), query: title });
  if (year !== null) params.set('year', String(year));

  const payload = await getJson(`${BASE}/search/movie?${params.toString()}`);
  const first = (payload as { results?: TmdbMovieSummary[] } | null)?.results?.[0];
  return first ? toMatch(first, null) : null;
}

export function posterUrl(posterPath: string, size: 'w185' | 'w342' = 'w342'): string {
  return `${IMAGE_BASE}/${size}${posterPath}`;
}
