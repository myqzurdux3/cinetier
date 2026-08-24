import { db } from './db';
import type { TmdbDetails } from './tmdb';

/** Thirty days, as for posters. Genres and runtimes change less than posters do. */
export const DETAILS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * undefined -> never looked up. null -> looked up, TMDB had nothing.
 * Keys are `movie:{id}` or `tv:{id}`: the same TMDB id can name a film and a
 * series, and the two endpoints answer differently.
 */
export async function getCachedDetails(key: string): Promise<TmdbDetails | null | undefined> {
  const entry = await (await db()).get('tmdbDetails', key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > DETAILS_CACHE_TTL_MS) return undefined;
  return entry.details;
}

export async function putCachedDetails(
  key: string,
  details: TmdbDetails | null,
  fetchedAt: number = Date.now(),
): Promise<void> {
  await (await db()).put('tmdbDetails', { details, fetchedAt }, key);
}
