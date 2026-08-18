import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLetterboxdExport } from '@/parsers/letterboxd';
import { ParseError } from '@/parsers/types';

const files = {
  diary: readFileSync('tests/fixtures/letterboxd-diary.csv', 'utf8'),
  ratings: readFileSync('tests/fixtures/letterboxd-ratings.csv', 'utf8'),
  watched: readFileSync('tests/fixtures/letterboxd-watched.csv', 'utf8'),
};

const DIARY_COLUMNS = [
  'Date',
  'Name',
  'Year',
  'Letterboxd URI',
  'Rating',
  'Rewatch',
  'Tags',
  'Watched Date',
] as const;

/** Build one diary row; unspecified columns come through blank, as a damaged export would produce. */
function diaryRow(fields: Partial<Record<(typeof DIARY_COLUMNS)[number], string>>): string {
  return DIARY_COLUMNS.map((column) => fields[column] ?? '').join(',');
}

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

  it('tolerates an out-of-range rating in the ratings pass for a film absent elsewhere', () => {
    const ratingsOnly =
      'Date,Name,Year,Letterboxd URI,Rating\n' +
      '2021-06-01,Good One,2021,https://boxd.it/good1,4\n' +
      '2021-07-01,Bad Six,2021,https://boxd.it/bad6,6';
    const result = parseLetterboxdExport({ ratings: ratingsOnly });
    expect(result.films).toHaveLength(1);
    expect(result.films.map((f) => f.title)).toEqual(['Good One']);
    expect(result.films.some((f) => f.id === 'lb:bad6')).toBe(false);
    expect(result.films.some((f) => f.title === 'Bad Six')).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/Bad Six/);
  });

  it('skips a diary row with a blank Name, keeping the rest of the file', () => {
    const blankName = diaryRow({
      Date: '2025-04-01',
      Year: '2020',
      'Letterboxd URI': 'https://boxd.it/blankname',
      Rating: '4',
      'Watched Date': '2025-04-01',
    });
    const before = parseLetterboxdExport({ diary: files.diary });
    const result = parseLetterboxdExport({ diary: `${files.diary}\n${blankName}` });
    expect(result.films).toHaveLength(before.films.length);
    expect(result.warnings).toContain('Skipped a row that could not be read: "untitled".');
  });

  it('skips diary rows whose Letterboxd URI yields no usable slug', () => {
    const emptyUri = diaryRow({
      Date: '2025-04-02',
      Name: 'Empty URI Film',
      Year: '2020',
      'Letterboxd URI': '',
      'Watched Date': '2025-04-02',
    });
    const trailingSlashOnlyUri = diaryRow({
      Date: '2025-04-03',
      Name: 'Trailing Slash Film',
      Year: '2020',
      'Letterboxd URI': '/',
      'Watched Date': '2025-04-03',
    });
    const before = parseLetterboxdExport({ diary: files.diary });
    const result = parseLetterboxdExport({
      diary: `${files.diary}\n${emptyUri}\n${trailingSlashOnlyUri}`,
    });
    expect(result.films).toHaveLength(before.films.length);
    expect(result.films.map((f) => f.title)).not.toContain('Empty URI Film');
    expect(result.films.map((f) => f.title)).not.toContain('Trailing Slash Film');
    expect(result.warnings).toContain('Skipped a row that could not be read: "Empty URI Film".');
    expect(result.warnings).toContain(
      'Skipped a row that could not be read: "Trailing Slash Film".',
    );
  });

  it('falls back to Date and treats a diary row as unrated when its trailing columns are cut off', () => {
    // A line cut off mid-export leaves Rating, Rewatch, Tags, and Watched Date
    // entirely absent (not merely blank), which is a distinct shape from a blank value.
    const severelyTruncated = '2025-04-06,Truncated Film,2020,https://boxd.it/truncated';
    const result = parseLetterboxdExport({ diary: `${files.diary}\n${severelyTruncated}` });
    const film = result.films.find((f) => f.title === 'Truncated Film');
    expect(film).toMatchObject({ rating: null, isRewatch: false });
    expect(film!.watchedAt).toEqual(new Date('2025-04-06'));
  });

  it('treats a non-numeric diary rating as unrated rather than erroring', () => {
    const garbledRating = diaryRow({
      Date: '2025-04-08',
      Name: 'Garbled Rating Film',
      Year: '2020',
      'Letterboxd URI': 'https://boxd.it/garbledrating',
      Rating: 'abc',
      'Watched Date': '2025-04-08',
    });
    const result = parseLetterboxdExport({ diary: `${files.diary}\n${garbledRating}` });
    const film = result.films.find((f) => f.title === 'Garbled Rating Film');
    expect(film).toBeDefined();
    expect(film!.rating).toBeNull();
  });

  it('falls back to Date when a diary row has an unparsable Watched Date', () => {
    const garbledDate = diaryRow({
      Date: '2025-04-09',
      Name: 'Garbled Date Film',
      Year: '2020',
      'Letterboxd URI': 'https://boxd.it/garbleddate',
      'Watched Date': 'not-a-date',
    });
    const result = parseLetterboxdExport({ diary: `${files.diary}\n${garbledDate}` });
    const film = result.films.find((f) => f.title === 'Garbled Date Film');
    expect(film!.watchedAt).toEqual(new Date('2025-04-09'));
  });

  it('reports an out-of-range diary rating as "untitled" when the Name is also blank', () => {
    const blankNameBadRating = diaryRow({
      Date: '2025-04-14',
      Year: '2020',
      'Letterboxd URI': 'https://boxd.it/blanknamebadrating',
      Rating: '6',
      'Watched Date': '2025-04-14',
    });
    const result = parseLetterboxdExport({ diary: `${files.diary}\n${blankNameBadRating}` });
    expect(result.warnings).toContain('Skipped a row with an out-of-range rating: "untitled".');
  });

  it('skips a diary row truncated before its Name column, keeping the rest of the file', () => {
    const ultraTruncated = '2025-04-10';
    const before = parseLetterboxdExport({ diary: files.diary });
    const result = parseLetterboxdExport({ diary: `${files.diary}\n${ultraTruncated}` });
    expect(result.films).toHaveLength(before.films.length);
    expect(result.warnings).toContain('Skipped a row that could not be read: "untitled".');
  });

  it('skips a ratings-only row truncated before its Name column, keeping the rest of the file', () => {
    const ultraTruncated = '2025-04-12';
    const before = parseLetterboxdExport({ ratings: files.ratings });
    const result = parseLetterboxdExport({ ratings: `${files.ratings}\n${ultraTruncated}` });
    expect(result.films).toHaveLength(before.films.length);
    expect(result.warnings).toContain('Skipped a row that could not be read: "untitled".');
  });

  it('skips a watched-only row truncated before its Name column, keeping the rest of the file', () => {
    const ultraTruncated = '2025-04-13';
    const before = parseLetterboxdExport({ watched: files.watched });
    const result = parseLetterboxdExport({ watched: `${files.watched}\n${ultraTruncated}` });
    expect(result.films).toHaveLength(before.films.length);
    expect(result.warnings).toContain('Skipped a row that could not be read: "untitled".');
  });
});
