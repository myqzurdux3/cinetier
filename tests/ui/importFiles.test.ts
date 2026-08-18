import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { importFiles } from '@/ui/import/importFiles';

const imdbCsv = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');
const diaryCsv = readFileSync('tests/fixtures/letterboxd-diary.csv', 'utf8');
const ratingsCsv = readFileSync('tests/fixtures/letterboxd-ratings.csv', 'utf8');

function file(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

/** A real Letterboxd-shaped archive, entries under a dated folder as they ship. */
async function archive(name: string, entries: Record<string, string>): Promise<File> {
  const writer = new ZipWriter(new BlobWriter('application/zip'));
  for (const [entry, content] of Object.entries(entries)) {
    await writer.add(`letterboxd-user-2026-08-18/${entry}`, new TextReader(content));
  }
  return new File([await writer.close()], name, { type: 'application/zip' });
}

describe('importFiles', () => {
  it('recognises an IMDb ratings export by its columns, whatever it is named', async () => {
    const outcome = await importFiles([file('export (1).csv', imdbCsv)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.films).toHaveLength(5);
    expect(outcome.films.every((f) => f.source === 'imdb')).toBe(true);
  });

  it('recognises a Letterboxd diary by its name', async () => {
    const outcome = await importFiles([file('diary.csv', diaryCsv)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.films).toHaveLength(5);
  });

  it('merges files from both services into one library', async () => {
    const outcome = await importFiles([file('ratings.csv', imdbCsv), file('diary.csv', diaryCsv)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    // 5 IMDb films + 5 diary films, with The Matrix, Pulp Fiction and Dune (2021)
    // appearing in both, so three pairs collapse.
    expect(outcome.films).toHaveLength(7);

    // Identity is title AND year: the IMDb fixture holds two different films called
    // Dune, and keeping them apart is the point of the year in the match key.
    const identities = outcome.films.map((film) => `${film.title}::${film.year}`);
    expect(new Set(identities).size).toBe(identities.length);

    const duneYears = outcome.films
      .filter((film) => film.title === 'Dune')
      .map((film) => film.year)
      .sort();
    expect(duneYears).toEqual([1984, 2021]);
  });

  it('recognises an IMDb header with no trailing newline (single-line file)', async () => {
    // The detection token "Your Rating" is placed last, so the header-slicing
    // bug (which drops the file's final character when there is no newline)
    // would break detection here even though it happens to survive on the
    // real IMDb fixture, where "Your Rating" is not the final column.
    const headerOnly = 'Title,Title Type,Year,Const,Your Rating';
    const outcome = await importFiles([file('ratings.csv', headerOnly)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.films).toHaveLength(0);
  });

  it("surfaces a ParseError's own message and hint, not the generic fallback", async () => {
    // Passes looksLikeImdb (has Const and Your Rating) but is missing the other
    // required columns, so parseImdbRatings throws from inside importFiles' try.
    const outcome = await importFiles([file('ratings.csv', 'Const,Your Rating\ntt0133093,9\n')]);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.message).toBe('This file is missing the column(s): Title, Title Type, Year.');
    expect(outcome.hint).toBe(
      'Export "Your Ratings" from IMDb and upload the ratings.csv file it produces.',
    );
  });

  it('reports an unrecognisable file with a hint rather than a stack trace', async () => {
    const outcome = await importFiles([file('holiday-photos.csv', 'a,b,c\n1,2,3')]);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.message).toMatch(/holiday-photos\.csv/);
    expect(outcome.hint).toMatch(/IMDb|Letterboxd/);
  });

  it('unpacks a Letterboxd export .zip and reads the files inside it', async () => {
    const zip = await archive('letterboxd-user.zip', {
      'diary.csv': diaryCsv,
      'ratings.csv': ratingsCsv,
    });

    const outcome = await importFiles([zip]);

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.films).toHaveLength(6);
    expect(outcome.films.every((f) => f.source === 'letterboxd')).toBe(true);

    // Both files inside the archive have to reach the parser, so look for the
    // film only the diary holds and the film only the ratings file holds.
    const titles = outcome.films.map((f) => f.title);
    expect(titles).toContain('Parasite');
    expect(titles).toContain('Stalker');
  });

  it('merges an archive with a loose IMDb export dropped alongside it', async () => {
    const zip = await archive('letterboxd-user.zip', { 'diary.csv': diaryCsv });

    const outcome = await importFiles([file('ratings.csv', imdbCsv), zip]);

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    // Same 5 + 5 with three overlaps as the loose-files case, so the archive's
    // contents are going through the very same merge.
    expect(outcome.films).toHaveLength(7);
  });

  it('reports an archive that holds none of the files it wants', async () => {
    const zip = await archive('letterboxd-user.zip', { 'profile.csv': 'nothing useful' });

    const outcome = await importFiles([zip]);

    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.message).toMatch(/diary\.csv/);
    expect(outcome.hint).toMatch(/Import & Export/);
  });

  it('reports an empty selection', async () => {
    const outcome = await importFiles([]);
    expect(outcome.status).toBe('error');
  });
});
