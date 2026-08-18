import Papa from 'papaparse';
import type { Film } from '@/domain/film';
import { normalizeRating } from '@/domain/rating';
import { ParseError, requireColumns, parseNumber, parseDate, type ParseResult } from './types';

const REQUIRED = ['Const', 'Your Rating', 'Title', 'Title Type', 'Year'];
const HINT = 'Export "Your Ratings" from IMDb and upload the ratings.csv file it produces.';

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Parse an IMDb "Your Ratings" CSV export into the unified Film model. */
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
    const titleType = (row['Title Type'] ?? '').trim().toLowerCase();
    // IMDb exports include series, episodes, and shorts; a film tier list wants films.
    if (titleType !== 'movie' && titleType !== 'tvmovie') {
      skipped += 1;
      continue;
    }

    const imdbId = (row['Const'] ?? '').trim();
    const title = (row['Title'] ?? '').trim();
    const rawRating = parseNumber(row['Your Rating']);

    if (!imdbId || !title || rawRating === null) {
      warnings.push(`Skipped a row that could not be read: "${title || 'untitled'}".`);
      continue;
    }

    // The user's own rating must be valid for the row to mean anything; a
    // corrupted or hand-edited export can carry a value outside 1-10, and
    // that should cost this one row, not the whole import.
    let rating: number;
    try {
      rating = normalizeRating(rawRating, 'imdb10');
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      warnings.push(`Skipped a row with an out-of-range rating: "${title}".`);
      continue;
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
