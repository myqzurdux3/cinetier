import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseImdbRatings } from '@/parsers/imdb';
import { ParseError } from '@/parsers/types';

const fixture = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');

const IMDB_COLUMNS = [
  'Const',
  'Your Rating',
  'Date Rated',
  'Title',
  'Original Title',
  'URL',
  'Title Type',
  'IMDb Rating',
  'Runtime (mins)',
  'Year',
  'Genres',
  'Num Votes',
  'Release Date',
  'Directors',
] as const;

/** Build one IMDb export row; unspecified columns come through blank, as a damaged export would produce. */
function imdbRow(fields: Partial<Record<(typeof IMDB_COLUMNS)[number], string>>): string {
  return IMDB_COLUMNS.map((column) => fields[column] ?? '').join(',');
}

describe('parseImdbRatings', () => {
  it('parses every film row and skips non-film entries', () => {
    const result = parseImdbRatings(fixture);
    expect(result.films).toHaveLength(5);
    expect(result.skipped).toBe(1);
    expect(result.films.map((f) => f.title)).not.toContain('Breaking Bad');
  });

  it('maps all fields of a row onto the Film model', () => {
    const matrix = parseImdbRatings(fixture).films.find((f) => f.imdbId === 'tt0133093')!;
    expect(matrix).toMatchObject({
      id: 'imdb:tt0133093',
      title: 'The Matrix',
      year: 1999,
      rating: 90,
      ratingScale: 'imdb10',
      isRewatch: false,
      genres: ['Action', 'Sci-Fi'],
      directors: ['Lana Wachowski', 'Lilly Wachowski'],
      runtimeMinutes: 136,
      publicRating: 87,
      source: 'imdb',
      tmdbId: null,
      posterPath: null,
    });
  });

  it('flags the watch date as approximate, because IMDb exports only a rating date', () => {
    const matrix = parseImdbRatings(fixture).films.find((f) => f.imdbId === 'tt0133093')!;
    expect(matrix.watchedAt).toEqual(new Date('2024-03-15'));
    expect(matrix.watchedAtIsApproximate).toBe(true);
  });

  it('rejects a file missing a required column with an actionable hint', () => {
    const wrongFile = 'Position,Const,Created,Title\n1,tt0133093,2024-01-01,The Matrix';
    expect(() => parseImdbRatings(wrongFile)).toThrow(ParseError);
    try {
      parseImdbRatings(wrongFile);
    } catch (error) {
      expect((error as ParseError).message).toMatch(/Your Rating/);
      expect((error as ParseError).hint).toMatch(/ratings\.csv/);
    }
  });

  it('rejects an empty file', () => {
    expect(() => parseImdbRatings('')).toThrow(ParseError);
  });

  it('tolerates a malformed row without losing the rest of the file', () => {
    const withBadRow = `${fixture}\ntt9999999,not-a-number,,Broken Row,,,Movie,,,,,,,`;
    const result = parseImdbRatings(withBadRow);
    expect(result.films).toHaveLength(5);
    expect(result.warnings.join(' ')).toMatch(/Broken Row/);
  });

  it('tolerates an out-of-range rating without losing the rest of the file', () => {
    const withBadRatings =
      `${fixture}\n` +
      'tt5555501,11,2023-01-01,Too High,,,Movie,8.0,120,2020,Drama,1000,2020-01-01,Someone\n' +
      'tt5555502,0,2023-01-01,Too Low,,,Movie,8.0,120,2020,Drama,1000,2020-01-01,Someone';
    const result = parseImdbRatings(withBadRatings);
    expect(result.films).toHaveLength(5);
    expect(result.warnings.join(' ')).toMatch(/Too High/);
    expect(result.warnings.join(' ')).toMatch(/Too Low/);
  });

  it('degrades an out-of-range public rating to null while keeping the row', () => {
    const withBadPublicRating =
      `${fixture}\n` +
      'tt5555503,7,2023-01-01,Bad Public Rating,,,Movie,99,120,2020,Drama,1000,2020-01-01,Someone';
    const result = parseImdbRatings(withBadPublicRating);
    const film = result.films.find((f) => f.title === 'Bad Public Rating')!;
    expect(film).toBeDefined();
    expect(film.rating).toBe(70);
    expect(film.publicRating).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/Bad Public Rating/);
  });

  it('skips a row with a blank Const, keeping the rest of the file', () => {
    const blankConst = imdbRow({
      'Your Rating': '9',
      'Date Rated': '2024-01-01',
      Title: 'No Const Film',
      'Title Type': 'Movie',
    });
    const result = parseImdbRatings(`${fixture}\n${blankConst}`);
    expect(result.films).toHaveLength(5);
    expect(result.films.some((f) => f.title === 'No Const Film')).toBe(false);
    expect(result.warnings).toContain('Skipped a row that could not be read: "No Const Film".');
  });

  it('skips a row with a blank Title, keeping the rest of the file', () => {
    const blankTitle = imdbRow({
      Const: 'tt5555510',
      'Your Rating': '9',
      'Date Rated': '2024-01-01',
      'Title Type': 'Movie',
    });
    const result = parseImdbRatings(`${fixture}\n${blankTitle}`);
    expect(result.films).toHaveLength(5);
    expect(result.films.some((f) => f.imdbId === 'tt5555510')).toBe(false);
    expect(result.warnings).toContain('Skipped a row that could not be read: "untitled".');
  });

  it('counts a row truncated before its title type as skipped, not imported', () => {
    // A line cut off mid-export leaves every trailing column entirely absent
    // (not merely blank), which is a distinct shape from a blank value.
    const severelyTruncated = 'tt5555540,7';
    const before = parseImdbRatings(fixture);
    const result = parseImdbRatings(`${fixture}\n${severelyTruncated}`);
    expect(result.films).toHaveLength(before.films.length);
    expect(result.skipped).toBe(before.skipped + 1);
  });

  it('fills in sensible defaults for a row missing every optional column', () => {
    const sparseRow = imdbRow({
      Const: 'tt5555550',
      'Your Rating': '7',
      Title: 'Sparse Film',
      'Title Type': 'Movie',
    });
    const result = parseImdbRatings(`${fixture}\n${sparseRow}`);
    const film = result.films.find((f) => f.imdbId === 'tt5555550');
    expect(film).toMatchObject({
      rating: 70,
      year: null,
      watchedAt: null,
      genres: [],
      directors: [],
      runtimeMinutes: null,
      publicRating: null,
    });
  });

  it('treats an unparsable Date Rated as no date rather than erroring', () => {
    const garbledDate = imdbRow({
      Const: 'tt5555560',
      'Your Rating': '8',
      'Date Rated': 'not-a-date',
      Title: 'Garbled Date Film',
      'Title Type': 'Movie',
    });
    const result = parseImdbRatings(`${fixture}\n${garbledDate}`);
    const film = result.films.find((f) => f.imdbId === 'tt5555560');
    expect(film).toBeDefined();
    expect(film!.watchedAt).toBeNull();
  });
});
