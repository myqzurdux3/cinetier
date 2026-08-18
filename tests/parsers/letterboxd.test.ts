import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLetterboxdExport } from '@/parsers/letterboxd';
import { ParseError } from '@/parsers/types';

const files = {
  diary: readFileSync('tests/fixtures/letterboxd-diary.csv', 'utf8'),
  ratings: readFileSync('tests/fixtures/letterboxd-ratings.csv', 'utf8'),
  watched: readFileSync('tests/fixtures/letterboxd-watched.csv', 'utf8'),
};

describe('parseLetterboxdExport', () => {
  it('merges the three files into one entry per film', () => {
    const result = parseLetterboxdExport(files);
    expect(result.films).toHaveLength(7);
    const titles = result.films.map((f) => f.title).sort();
    expect(titles).toEqual([
      'Amélie',
      'Dune',
      'Parasite',
      'Pulp Fiction',
      'Solaris',
      'Stalker',
      'The Matrix',
    ]);
  });

  it('maps a diary entry onto the Film model with a precise watch date', () => {
    const matrix = parseLetterboxdExport(files).films.find((f) => f.title === 'The Matrix');
    expect(matrix).toMatchObject({
      id: 'lb:1a2b',
      title: 'The Matrix',
      year: 1999,
      rating: 90,
      ratingScale: 'letterboxd5',
      isRewatch: true,
      watchedAtIsApproximate: false,
      source: 'letterboxd',
      imdbId: null,
      genres: [],
      directors: [],
      runtimeMinutes: null,
      publicRating: null,
    });
    expect(matrix!.watchedAt).toEqual(new Date('2025-03-09'));
  });

  it('keeps a film that was rated but never logged in the diary', () => {
    const stalker = parseLetterboxdExport(files).films.find((f) => f.title === 'Stalker')!;
    expect(stalker.rating).toBe(90);
    expect(stalker.isRewatch).toBe(false);
  });

  it('keeps a watched film that was never rated', () => {
    const solaris = parseLetterboxdExport(files).films.find((f) => f.title === 'Solaris')!;
    expect(solaris.rating).toBeNull();
  });

  it('works from the diary alone', () => {
    const result = parseLetterboxdExport({ diary: files.diary });
    expect(result.films).toHaveLength(5);
  });

  it('rejects an export with no usable file', () => {
    expect(() => parseLetterboxdExport({})).toThrow(ParseError);
  });

  it('rejects a file whose columns do not match a Letterboxd export', () => {
    expect(() => parseLetterboxdExport({ ratings: 'Const,Your Rating\ntt01,9' })).toThrow(
      ParseError,
    );
  });

  it('tolerates an out-of-range rating without losing the rest of the file', () => {
    const diaryWithBadRow =
      `${files.diary}\n` +
      '2020-01-01,Too High,2020,https://boxd.it/bad1,6,,,2020-01-01\n' +
      '2020-01-02,Too Low,2020,https://boxd.it/bad2,0,,,2020-01-02';
    const result = parseLetterboxdExport({ diary: diaryWithBadRow });
    expect(result.films).toHaveLength(5);
    expect(result.films.map((f) => f.title)).not.toContain('Too High');
    expect(result.films.map((f) => f.title)).not.toContain('Too Low');
    expect(result.warnings.join(' ')).toMatch(/Too High/);
    expect(result.warnings.join(' ')).toMatch(/Too Low/);
  });
});
