import Papa from 'papaparse';
import type { Film } from '@/domain/film';
import { normalizeRating } from '@/domain/rating';
import { classifyTitleType } from '@/domain/titleType';
import { ParseError, requireColumns, parseNumber, parseDate, type ParseResult } from './types';

// "Your Rating" is deliberately absent: an IMDb *list* export (your watchlist, or
// any custom list) carries the same columns without it, and those titles are
// watch history worth importing even though they carry no score.
const REQUIRED = ['Const', 'Title'];
const HINT =
  'Export "Your Ratings" from IMDb, or any of your lists, and upload the .csv file it produces.';

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Parse an IMDb ratings or list CSV export into the unified Film model. */
export function parseImdbRatings(csvText: string): ParseResult {
  if (csvText.trim() === '') {
    throw new ParseError('This file is empty.', HINT);
  }

  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  requireColumns(parsed.meta.fields ?? [], REQUIRED, HINT);

  const films: Film[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const row of parsed.data) {
    // The label is localized by the account's IMDb language, so it is classified
    // rather than compared. Only non-screen entries (video games, podcasts) are
    // dropped; everything watchable is imported and separated by the type filter.
    const titleType = classifyTitleType(row['Title Type'] ?? '');
    if (titleType === null) {
      skipped += 1;
      continue;
    }

    const imdbId = (row['Const'] ?? '').trim();
    const title = (row['Title'] ?? '').trim();

    if (!imdbId || !title) {
      warnings.push(`Skipped a row that could not be read: "${title || 'untitled'}".`);
      continue;
    }

    // A list export has no rating column at all, and a ratings export can still
    // carry a blank cell. Either way the title was watched, which is what the
    // library is for — an absent rating leaves the film unranked, not excluded.
    const rawRating = parseNumber(row['Your Rating']);
    let rating: number | null = null;
    if (rawRating !== null) {
      // A corrupted or hand-edited export can carry a value outside 1-10; that
      // should cost this row its rating, not its place in the library.
      try {
        rating = normalizeRating(rawRating, 'imdb10');
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        warnings.push(`Ignored an out-of-range rating for "${title}".`);
      }
    }

    // The public rating is informational, not the user's own data, so a
    // corrupted value degrades to "unknown" rather than dropping the row.
    const rawPublicRating = parseNumber(row['IMDb Rating']);
    let publicRating: number | null = null;
    if (rawPublicRating !== null) {
      try {
        publicRating = normalizeRating(rawPublicRating, 'imdb10');
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        warnings.push(`Ignored an out-of-range public rating for "${title}".`);
      }
    }

    films.push({
      id: `imdb:${imdbId}`,
      imdbId,
      tmdbId: null,
      title,
      year: parseNumber(row['Year']),
      titleType,
      rating,
      ratingScale: 'imdb10',
      watchedAt: parseDate(row['Date Rated']),
      // IMDb never exports a watch date. This is the date the user rated the film.
      watchedAtIsApproximate: true,
      isRewatch: false,
      genres: splitList(row['Genres']),
      directors: splitList(row['Directors']),
      runtimeMinutes: parseNumber(row['Runtime (mins)']),
      publicRating,
      posterPath: null,
      source: 'imdb',
    });
  }

  return { films, skipped, warnings };
}
