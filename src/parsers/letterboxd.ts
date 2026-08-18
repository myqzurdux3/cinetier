import Papa from 'papaparse';
import type { Film } from '@/domain/film';
import { normalizeRating } from '@/domain/rating';
import { ParseError, requireColumns, type ParseResult } from './types';

export interface LetterboxdFiles {
  diary?: string;
  ratings?: string;
  watched?: string;
}

const HINT =
  'In Letterboxd, go to Settings > Data > Export your data, then upload the .zip file without unpacking it.';

/** The slug at the end of a Letterboxd URI, used as a stable per-film identifier. */
function slugFromUri(uri: string | undefined): string | null {
  if (!uri) return null;
  const trimmed = uri.trim().replace(/\/$/, '');
  const slug = trimmed.split('/').pop();
  return slug && slug !== '' ? slug : null;
}

function parseNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | undefined): Date | null {
  if (!value || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseCsv(text: string, required: string[]): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  requireColumns(parsed.meta.fields ?? [], required, HINT);
  return parsed.data;
}

/**
 * Normalize a row's own rating, if present. A corrupted or hand-edited
 * export can carry a value outside 0.5-5; that must cost this one row,
 * not the whole import, so the caller skips the row on a RangeError
 * rather than let a partially built Film be created for it.
 */
function normalizeRowRating(
  row: Record<string, string>,
  name: string,
  warnings: string[],
): { ok: true; rating: number | null } | { ok: false } {
  const raw = parseNumber(row['Rating']);
  if (raw === null) return { ok: true, rating: null };
  try {
    return { ok: true, rating: normalizeRating(raw, 'letterboxd5') };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    warnings.push(`Skipped a row with an out-of-range rating: "${name || 'untitled'}".`);
    return { ok: false };
  }
}

function blankFilm(slug: string, row: Record<string, string>): Film {
  return {
    id: `lb:${slug}`,
    imdbId: null,
    tmdbId: null,
    title: (row['Name'] ?? '').trim(),
    year: parseNumber(row['Year']),
    rating: null,
    ratingScale: 'letterboxd5',
    watchedAt: null,
    watchedAtIsApproximate: false,
    isRewatch: false,
    // Letterboxd exports carry no metadata; TMDB enrichment fills these in plan 2.
    genres: [],
    directors: [],
    runtimeMinutes: null,
    publicRating: null,
    posterPath: null,
    source: 'letterboxd',
  };
}

/**
 * Merge the diary, ratings, and watched files of a Letterboxd export.
 * The files overlap heavily, so each is folded into a map keyed by film slug,
 * in order of decreasing richness: diary, then ratings, then watched.
 */
export function parseLetterboxdExport(files: LetterboxdFiles): ParseResult {
  if (!files.diary && !files.ratings && !files.watched) {
    throw new ParseError('No Letterboxd data file was found in this export.', HINT);
  }

  const bySlug = new Map<string, Film>();
  const warnings: string[] = [];

  const upsert = (row: Record<string, string>): Film | null => {
    const slug = slugFromUri(row['Letterboxd URI']);
    const name = (row['Name'] ?? '').trim();
    if (!slug || !name) {
      warnings.push(`Skipped a row that could not be read: "${name || 'untitled'}".`);
      return null;
    }
    const existing = bySlug.get(slug);
    if (existing) return existing;
    const film = blankFilm(slug, row);
    bySlug.set(slug, film);
    return film;
  };

  // The diary is the only file with watch dates and rewatch flags.
  if (files.diary) {
    for (const row of parseCsv(files.diary, ['Name', 'Letterboxd URI', 'Watched Date'])) {
      const name = (row['Name'] ?? '').trim();
      const parsedRating = normalizeRowRating(row, name, warnings);
      if (!parsedRating.ok) continue;
      const film = upsert(row);
      if (!film) continue;
      if (parsedRating.rating !== null) film.rating = parsedRating.rating;
      film.watchedAt = parseDate(row['Watched Date']) ?? parseDate(row['Date']);
      film.isRewatch = (row['Rewatch'] ?? '').trim().toLowerCase() === 'yes';
    }
  }

  // Ratings adds films rated outside the diary; it must not overwrite a diary date.
  if (files.ratings) {
    for (const row of parseCsv(files.ratings, ['Name', 'Letterboxd URI', 'Rating'])) {
      const name = (row['Name'] ?? '').trim();
      const parsedRating = normalizeRowRating(row, name, warnings);
      if (!parsedRating.ok) continue;
      const film = upsert(row);
      if (!film) continue;
      if (film.rating === null && parsedRating.rating !== null) {
        film.rating = parsedRating.rating;
      }
      film.watchedAt ??= parseDate(row['Date']);
    }
  }

  // Watched contributes only films absent from both other files.
  if (files.watched) {
    for (const row of parseCsv(files.watched, ['Name', 'Letterboxd URI'])) {
      const film = upsert(row);
      if (!film) continue;
      film.watchedAt ??= parseDate(row['Date']);
    }
  }

  return { films: [...bySlug.values()], skipped: 0, warnings };
}
