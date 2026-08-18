import { normalizeRating } from '@/domain/rating';

export interface TmdbMatch {
  tmdbId: number;
  imdbId: string | null;
  posterPath: string | null;
  publicRating: number | null;
}

interface TmdbMovieSummary {
  id: number;
  poster_path: string | null;
  vote_average: number;
}

const BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * TMDB reports 0 for a film nobody has rated. Passing that to normalizeRating
 * would throw, so an absent rating is represented as absent.
 */
function toPublicRating(voteAverage: number): number | null {
  if (!Number.isFinite(voteAverage) || voteAverage <= 0 || voteAverage > 10) return null;
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

/** Resolve a film by its IMDb identifier — the reliable path, when we have one. */
export async function lookupByImdbId(imdbId: string): Promise<TmdbMatch | null> {
  const payload = await getJson(`${BASE}/find/${imdbId}?api_key=${key()}&external_source=imdb_id`);
  const results = (payload as { movie_results?: TmdbMovieSummary[] } | null)?.movie_results;
  const first = results?.[0];
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
