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
