import type { Film } from './film';

/**
 * Reduce a title to a comparable form: lowercase, unaccented, punctuation-free.
 * Used only for matching; the original title is always what gets displayed.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * The key used to decide whether two records describe the same film.
 * IMDb identifiers are authoritative; title and year are the fallback for
 * Letterboxd exports, which carry no cross-service identifier.
 */
export function matchKey(film: Pick<Film, 'imdbId' | 'title' | 'year'>): string {
  if (film.imdbId) return `imdb:${film.imdbId}`;
  return `title:${normalizeTitle(film.title)}::${film.year ?? 'unknown'}`;
}
