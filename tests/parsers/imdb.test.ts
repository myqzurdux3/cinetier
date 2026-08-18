import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseImdbRatings } from '@/parsers/imdb';
import { ParseError } from '@/parsers/types';

const fixture = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');

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
});
