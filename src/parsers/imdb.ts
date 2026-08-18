import Papa from 'papaparse';
import type { Film } from '@/domain/film';
import { normalizeRating } from '@/domain/rating';
import { ParseError, requireColumns, type ParseResult } from './types';

const REQUIRED = ['Const', 'Your Rating', 'Title', 'Title Type', 'Year'];
const HINT = 'Export "Your Ratings" from IMDb and upload the ratings.csv file it produces.';

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
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

    const publicRating = parseNumber(row['IMDb Rating']);

    films.push({
      id: `imdb:${imdbId}`,
      imdbId,
      tmdbId: null,
      title,
      year: parseNumber(row['Year']),
      rating: normalizeRating(rawRating, 'imdb10'),
      ratingScale: 'imdb10',
      watchedAt: parseDate(row['Date Rated']),
      // IMDb never exports a watch date. This is the date the user rated the film.
      watchedAtIsApproximate: true,
      isRewatch: false,
      genres: splitList(row['Genres']),
      directors: splitList(row['Directors']),
      runtimeMinutes: parseNumber(row['Runtime (mins)']),
      publicRating: publicRating === null ? null : normalizeRating(publicRating, 'imdb10'),
      posterPath: null,
      source: 'imdb',
    });
  }

  return { films, skipped, warnings };
}
