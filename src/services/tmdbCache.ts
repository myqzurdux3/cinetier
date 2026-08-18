import { db } from './db';
import type { TmdbMatch } from './tmdb';

/** Thirty days. Posters change rarely, and a stale poster is a small cost. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * undefined -> never looked up. null -> looked up, TMDB had nothing.
 * The difference is what stops us asking about the same unknown film forever.
 */
export async function getCached(key: string): Promise<TmdbMatch | null | undefined> {
  const entry = await (await db()).get('tmdb', key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return undefined;
  return entry.match;
}

export async function putCached(
  key: string,
  match: TmdbMatch | null,
  fetchedAt: number = Date.now(),
): Promise<void> {
  await (await db()).put('tmdb', { match, fetchedAt }, key);
}
