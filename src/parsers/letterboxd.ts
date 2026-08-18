import Papa from 'papaparse';
import type { Film } from '@/domain/film';
import { normalizeRating } from '@/domain/rating';
import { ParseError, requireColumns, parseNumber, parseDate, type ParseResult } from './types';

export interface LetterboxdFiles {
  diary?: string;
  ratings?: string;
  watched?: string;
}

const HINT =
  'In Letterboxd, open Settings > Import & Export and choose Export Your Data, then upload the .zip file without unpacking it.';

/** The slug at the end of a Letterboxd URI, used as a stable per-film identifier. */
function slugFromUri(uri: string | undefined): string | null {
  if (!uri) return null;
  const trimmed = uri.trim().replace(/\/$/, '');
  const slug = trimmed.split('/').pop();
  return slug && slug !== '' ? slug : null;
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
    // Only diary.csv's "Watched Date" is a real watch date; every other column
    // this parser can fall back to is a rating or logging date standing in for one.
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

/** One diary row's contribution: diary.csv holds a row per viewing, not per film. */
interface Viewing {
  watchedAt: Date | null;
  watchedAtIsApproximate: boolean;
  rating: number | null;
  rewatchFlag: boolean;
}

interface DiaryHistory {
  film: Film;
  viewings: number;
  anyRewatchFlag: boolean;
  /** The viewing whose date and rating the Film reports. */
  viewing: Viewing;
}

/**
 * Which of two viewings the film should report. A dated row always beats an
 * undated one and the newest date wins; the remaining comparisons only break
 * ties, so the fold never depends on the order the rows appear in the file.
 */
function isLaterViewing(candidate: Viewing, current: Viewing): boolean {
  if (candidate.watchedAt === null) return false;
  if (current.watchedAt === null) return true;
  const difference = candidate.watchedAt.getTime() - current.watchedAt.getTime();
  if (difference !== 0) return difference > 0;
  if (candidate.watchedAtIsApproximate !== current.watchedAtIsApproximate) {
    return !candidate.watchedAtIsApproximate;
  }
  if (current.rating === null && candidate.rating !== null) return true;
  // Same date, same precision, both rated: prefer the higher rating. Without this
  // the winner would be whichever row the file happened to list first.
  if (current.rating !== null && candidate.rating !== null) {
    return candidate.rating > current.rating;
  }
  return false;
}

/** Fill a missing watch date from a column that is not a watch date, and say so. */
function applyApproximateDate(film: Film, date: Date | null): void {
  if (film.watchedAt !== null || date === null) return;
  film.watchedAt = date;
  film.watchedAtIsApproximate = true;
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
    const history = new Map<string, DiaryHistory>();
    for (const row of parseCsv(files.diary, ['Name', 'Letterboxd URI', 'Watched Date'])) {
      const name = (row['Name'] ?? '').trim();
      const parsedRating = normalizeRowRating(row, name, warnings);
      if (!parsedRating.ok) continue;
      const film = upsert(row);
      if (!film) continue;
      const watchedAt = parseDate(row['Watched Date']);
      const viewing: Viewing = {
        // "Date" is the day the entry was logged, so it is only ever an approximation.
        watchedAt: watchedAt ?? parseDate(row['Date']),
        watchedAtIsApproximate: watchedAt === null,
        rating: parsedRating.rating,
        rewatchFlag: (row['Rewatch'] ?? '').trim().toLowerCase() === 'yes',
      };
      const seen = history.get(film.id);
      if (!seen) {
        history.set(film.id, { film, viewings: 1, anyRewatchFlag: viewing.rewatchFlag, viewing });
        continue;
      }
      seen.viewings += 1;
      seen.anyRewatchFlag ||= viewing.rewatchFlag;
      if (isLaterViewing(viewing, seen.viewing)) seen.viewing = viewing;
    }
    for (const { film, viewings, anyRewatchFlag, viewing } of history.values()) {
      // A second row for the same film is itself a rewatch, whether or not
      // Letterboxd flagged it as one.
      film.isRewatch = film.isRewatch || anyRewatchFlag || viewings > 1;
      if (viewing.watchedAt !== null) {
        film.watchedAt = viewing.watchedAt;
        film.watchedAtIsApproximate = viewing.watchedAtIsApproximate;
      }
      // The rating travels with the date, so the two always describe one viewing.
      if (viewing.rating !== null) film.rating = viewing.rating;
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
      // "Date" here is the date rated, not a watch date.
      applyApproximateDate(film, parseDate(row['Date']));
    }
  }

  // Watched contributes only films absent from both other files.
  if (files.watched) {
    for (const row of parseCsv(files.watched, ['Name', 'Letterboxd URI'])) {
      const film = upsert(row);
      if (!film) continue;
      // "Date" here is the date the film was added to the watched list.
      applyApproximateDate(film, parseDate(row['Date']));
    }
  }

  return { films: [...bySlug.values()], skipped: 0, warnings };
}
