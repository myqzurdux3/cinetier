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

/**
 * TMDB could not be asked — the network dropped, the key was refused, the
 * service answered 5xx or rate-limited us.
 *
 * Distinct from "TMDB answered, and has nothing", which is a `null` result.
 * The two used to be the same value, and the caches record a result for thirty
 * days: a title that failed because a train went into a tunnel would not be
 * asked about again for a month. Only the answer is worth remembering.
 */
export class TmdbUnavailable extends Error {}

async function getJson(url: string): Promise<unknown | null> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new TmdbUnavailable('The TMDB request could not be made', { cause: error });
  }

  // 404 is an answer: this identifier names nothing at TMDB. Every other
  // refusal is TMDB not answering, and says nothing about the title.
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new TmdbUnavailable(`TMDB answered ${String(response.status)}`);
  }

  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new TmdbUnavailable('TMDB answered with something that is not JSON', { cause: error });
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
  // Encoded like every other user-supplied value that reaches a URL. An IMDb
  // id is `tt` and digits in every export seen so far, but this one comes out
  // of a CSV the user chose, and the title beside it has always been encoded.
  const path = `${BASE}/find/${encodeURIComponent(imdbId)}`;
  const payload = await getJson(`${path}?api_key=${key()}&external_source=imdb_id`);
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

interface TmdbNamed {
  name?: string;
}

interface TmdbMovieDetail {
  genres?: TmdbNamed[];
  runtime?: number | null;
  credits?: { crew?: { job?: string; name?: string }[] };
}

interface TmdbTvDetail {
  genres?: TmdbNamed[];
  episode_run_time?: number[];
  created_by?: TmdbNamed[];
}

function names(values: TmdbNamed[] | undefined): string[] {
  return (values ?? [])
    .map((value) => value.name)
    .filter((name): name is string => typeof name === 'string' && name !== '');
}

/** TMDB reports 0 for a runtime nobody has filled in, which is not a runtime. */
function positiveRuntime(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export async function fetchMovieDetails(tmdbId: number): Promise<TmdbDetails | null> {
  const payload = await getJson(
    `${BASE}/movie/${tmdbId}?api_key=${key()}&append_to_response=credits`,
  );
  if (payload === null) return null;

  const detail = payload as TmdbMovieDetail;
  return {
    genres: names(detail.genres),
    runtimeMinutes: positiveRuntime(detail.runtime),
    directors: names((detail.credits?.crew ?? []).filter((member) => member.job === 'Director')),
  };
}

/**
 * A series has no director field. `created_by` is the closest true equivalent,
 * and the rail shows it under the Director heading rather than inventing a
 * second one for a handful of titles.
 */
export async function fetchTvDetails(tmdbId: number): Promise<TmdbDetails | null> {
  const payload = await getJson(`${BASE}/tv/${tmdbId}?api_key=${key()}`);
  if (payload === null) return null;

  const detail = payload as TmdbTvDetail;
  return {
    genres: names(detail.genres),
    runtimeMinutes: positiveRuntime(detail.episode_run_time?.[0]),
    directors: names(detail.created_by),
  };
}
