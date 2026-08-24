import type { Film, FilmSource } from '@/domain/film';
import { RATING_SCALES, type RatingScale } from '@/domain/rating';
import { TITLE_TYPES, type TitleType } from '@/domain/titleType';
import { TIER_COLORS, type Tier, type TierBoard, type TierColor } from '@/domain/tiers';
import { boardFilename } from '@/domain/filename';
import { ParseError } from './types';

/**
 * A library and one board, as a file you can carry to another browser.
 *
 * This is the only thing Cinetier writes that Cinetier also reads, which makes
 * it the only place where a file's contents are entirely this application's
 * own doing — and the only place where trusting them anyway would be a
 * mistake. A file is a file: it can be hand-edited, truncated by a failed
 * download, or written by a version that does not exist yet. Everything below
 * is checked before any of it reaches the rest of the application.
 */
export const ENVELOPE_VERSION = 1;

const HINT =
  'Use a file saved by Cinetier itself, with "Save as a file" above the board. To import ratings, drop the export IMDb or Letterboxd gave you instead.';

interface Envelope {
  cinetier: number;
  exportedAt: string;
  board: TierBoard;
  films: Film[];
}

/** A board's `.json`, named to match the image beside it. */
export function envelopeFilename(boardName: string): string {
  return boardFilename(boardName, 'json');
}

/** The text of a `.json` file carrying `films` and `board`. */
export function buildEnvelope(films: Film[], board: TierBoard, exportedAt: Date): string {
  const envelope: Envelope = {
    cinetier: ENVELOPE_VERSION,
    exportedAt: exportedAt.toISOString(),
    board,
    films,
  };
  // Two spaces: the file is small next to the poster cache it does not carry,
  // and a person who opens it should be able to read it.
  return JSON.stringify(envelope, null, 2);
}

function fail(what: string): never {
  throw new ParseError(`This file is not a Cinetier export: ${what}.`, HINT);
}

function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(what);
  return value as Record<string, unknown>;
}

function string(value: unknown, what: string): string {
  if (typeof value !== 'string') fail(what);
  return value;
}

function nullableString(value: unknown, what: string): string | null {
  if (value === null) return null;
  return string(value, what);
}

function nullableNumber(value: unknown, what: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(what);
  return value;
}

function boolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') fail(what);
  return value;
}

function strings(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) fail(what);
  return value.map((entry) => string(entry, what));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  const text = string(value, what);
  if (!(allowed as readonly string[]).includes(text)) fail(what);
  return text as T;
}

/**
 * A date back from JSON, where it is a string.
 *
 * An unparseable one costs that film its watch date rather than the whole
 * import: a library is worth having with one date missing from it, and the
 * date is the least load-bearing field a film has.
 */
function date(value: unknown, warnings: string[], title: string): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = new Date(string(value, 'a watch date is not text'));
  if (Number.isNaN(parsed.getTime())) {
    warnings.push(`Ignored an unreadable watch date for "${title}".`);
    return null;
  }
  return parsed;
}

function film(value: unknown, warnings: string[]): Film {
  const raw = object(value, 'one of its films is not an object');
  const title = string(raw['title'], 'a film has no title');
  return {
    id: string(raw['id'], 'a film has no id'),
    imdbId: nullableString(raw['imdbId'], `"${title}" has a malformed IMDb id`),
    tmdbId: nullableNumber(raw['tmdbId'], `"${title}" has a malformed TMDB id`),
    title,
    year: nullableNumber(raw['year'], `"${title}" has a malformed year`),
    titleType: oneOf<TitleType>(raw['titleType'], TITLE_TYPES, `"${title}" has an unknown type`),
    rating: nullableNumber(raw['rating'], `"${title}" has a malformed rating`),
    ratingScale: oneOf<RatingScale>(
      raw['ratingScale'],
      RATING_SCALES,
      `"${title}" has an unknown rating scale`,
    ),
    watchedAt: date(raw['watchedAt'], warnings, title),
    watchedAtIsApproximate: boolean(
      raw['watchedAtIsApproximate'],
      `"${title}" has a malformed watch-date flag`,
    ),
    isRewatch: boolean(raw['isRewatch'], `"${title}" has a malformed rewatch flag`),
    genres: strings(raw['genres'], `"${title}" has malformed genres`),
    directors: strings(raw['directors'], `"${title}" has malformed directors`),
    runtimeMinutes: nullableNumber(raw['runtimeMinutes'], `"${title}" has a malformed runtime`),
    publicRating: nullableNumber(raw['publicRating'], `"${title}" has a malformed public rating`),
    posterPath: nullableString(raw['posterPath'], `"${title}" has a malformed poster path`),
    detailsFetched: boolean(raw['detailsFetched'], `"${title}" has a malformed details flag`),
    source: oneOf<FilmSource>(
      raw['source'],
      ['imdb', 'letterboxd'] as const,
      `"${title}" came from an unknown service`,
    ),
  };
}

function tier(value: unknown): Tier {
  const raw = object(value, 'one of its rows is not an object');
  return {
    id: string(raw['id'], 'a row has no id'),
    label: string(raw['label'], 'a row has no label'),
    color: oneOf<TierColor>(raw['color'], TIER_COLORS, 'a row has an unknown colour'),
    minRating: nullableNumber(raw['minRating'], 'a row has a malformed threshold'),
  };
}

function board(value: unknown, filmIds: Set<string>, warnings: string[]): TierBoard {
  const raw = object(value, 'its board is not an object');
  const tiers = raw['tiers'];
  if (!Array.isArray(tiers) || tiers.length === 0) fail('its board has no rows');
  const parsedTiers = tiers.map(tier);
  const known = new Set(parsedTiers.map((entry) => entry.id));

  const placementsRaw = object(raw['placements'], 'its board has no placements');
  const placements: Record<string, string[]> = {};
  for (const parsed of parsedTiers) placements[parsed.id] = [];

  let dropped = 0;
  for (const [tierId, ids] of Object.entries(placementsRaw)) {
    // A placement naming a row the file does not define, or a film it does not
    // carry, is dropped rather than fatal. The rest of the ranking is still
    // the user's work, and refusing all of it over one stale id would be the
    // more destructive answer.
    if (!known.has(tierId)) {
      dropped += Array.isArray(ids) ? ids.length : 0;
      continue;
    }
    placements[tierId] = strings(ids, 'a row holds something that is not a list of films').filter(
      (id) => {
        if (filmIds.has(id)) return true;
        dropped += 1;
        return false;
      },
    );
  }
  if (dropped > 0) {
    warnings.push(
      dropped === 1
        ? 'One placed film was not in the file and has been left out.'
        : `${String(dropped)} placed films were not in the file and have been left out.`,
    );
  }

  return {
    id: string(raw['id'], 'its board has no id'),
    name: string(raw['name'], 'its board has no name'),
    tiers: parsedTiers,
    placements,
  };
}

export interface EnvelopeResult {
  films: Film[];
  board: TierBoard;
  warnings: string[];
}

/** Read a `.json` file this application wrote. */
export function parseEnvelope(text: string): EnvelopeResult {
  if (text.trim() === '') throw new ParseError('This file is empty.', HINT);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ParseError('This file is not valid JSON.', HINT);
  }

  const raw = object(parsed, 'it is not an object');
  const version = raw['cinetier'];
  if (typeof version !== 'number') fail('it does not say which version wrote it');
  if (version > ENVELOPE_VERSION) {
    throw new ParseError(
      `This file was written by a newer version of Cinetier (format ${String(version)}, this one reads ${String(ENVELOPE_VERSION)}).`,
      'Open it in the version that wrote it, or export again from this one.',
    );
  }

  const films = raw['films'];
  if (!Array.isArray(films)) fail('it carries no films');
  const warnings: string[] = [];
  const parsedFilms = films.map((entry) => film(entry, warnings));
  if (parsedFilms.length === 0) fail('it carries no films');

  const ids = new Set(parsedFilms.map((entry) => entry.id));
  return { films: parsedFilms, board: board(raw['board'], ids, warnings), warnings };
}
