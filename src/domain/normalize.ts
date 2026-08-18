import type { Film } from './film';

/**
 * Reduce a title to a comparable form: lowercase, unaccented, punctuation-free.
 * Used only for matching; the original title is always what gets displayed.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * The identity of a film that carries no identifier to match on: its normalized
 * title and its year. Deduplication and the enrichment cache both key on this,
 * and they have to agree — if the two formats ever drifted apart, every cached
 * lookup for an identifier-less film would silently miss, and the cache would
 * quietly stop being a cache. One definition, so drift is not expressible.
 */
export function titleYearKey(film: Pick<Film, 'title' | 'year'>): string {
  return `title:${normalizeTitle(film.title)}::${film.year ?? 'unknown'}`;
}
