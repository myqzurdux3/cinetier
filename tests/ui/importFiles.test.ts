import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { importFiles } from '@/ui/import/importFiles';

const imdbCsv = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');
const diaryCsv = readFileSync('tests/fixtures/letterboxd-diary.csv', 'utf8');
const ratingsCsv = readFileSync('tests/fixtures/letterboxd-ratings.csv', 'utf8');

function file(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

/**
 * A real Letterboxd-shaped archive, entries under a dated folder as they ship.
 *
 * Built from bytes rather than with BlobWriter/TextReader: zip.js assembles a
 * BlobWriter's output with `new Response(stream).blob()`, and under jsdom the
 * Blob that comes back is not always jsdom's own. jsdom's Blob constructor
 * does not recognise a foreign Blob as a part and stringifies it to
 * "[object Blob]", so the archive would silently come out as 13 bytes of
 * nonsense. Uint8Array in, Uint8Array out keeps the fixture honest.
 */
async function archive(name: string, entries: Record<string, string>): Promise<File> {
  const writer = new ZipWriter(new Uint8ArrayWriter());
  for (const [entry, content] of Object.entries(entries)) {
    await writer.add(
      `letterboxd-user-2026-08-18/${entry}`,
      new Uint8ArrayReader(new TextEncoder().encode(content)),
    );
  }
  return new File([await writer.close()], name, { type: 'application/zip' });
}

describe('importFiles', () => {
  it('recognises an IMDb ratings export by its columns, whatever it is named', async () => {
    const outcome = await importFiles([file('export (1).csv', imdbCsv)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.films).toHaveLength(6);
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

    // 6 IMDb titles + 5 diary films, with The Matrix, Pulp Fiction and Dune (2021)
    // appearing in both, so three pairs collapse.
    expect(outcome.films).toHaveLength(8);

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

  it('recognises an IMDb file whose last line has no trailing newline', async () => {
    // The detection token "Title Type" is placed last and the file ends without
    // a newline, so the header-slicing bug (which drops the file's final
    // character in that case) would break detection here even though it happens
    // to survive on the real IMDb fixture, where "Title Type" is mid-header.
    const noTrailingNewline =
      'Const,Your Rating,Title,Year,Title Type\ntt0133093,9,The Matrix,1999,Movie';
    const outcome = await importFiles([file('export.csv', noTrailingNewline)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.films).toHaveLength(1);
    expect(outcome.films[0]!.source).toBe('imdb');
  });

  it('reports an import that produced no title, rather than an empty library', async () => {
    // Reproduces a real French export made entirely of series and video games:
    // every row is understood, none of them survives, and the old code handed
    // the next screen an empty list that looked like a broken site.
    const onlyGames =
      'Const,Your Rating,Title,Year,Title Type\n' +
      'tt2465146,9,The Last of Us,2013,Jeu vidéo\n' +
      'tt9999001,8,Some Podcast,2020,Podcast Series\n';
    const outcome = await importFiles([file('export.csv', onlyGames)]);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.message).toMatch(/2 entries/);
  });

  it('reports how many entries were skipped on a successful import', async () => {
    const withAGame =
      'Const,Your Rating,Title,Year,Title Type\n' +
      'tt0133093,9,The Matrix,1999,Movie\n' +
      'tt2465146,9,The Last of Us,2013,Video Game\n';
    const outcome = await importFiles([file('export.csv', withAGame)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.films).toHaveLength(1);
    expect(outcome.skipped).toBe(1);
  });

  it("surfaces a ParseError's own message and hint, not the generic fallback", async () => {
    // Passes looksLikeImdb (has Const and Title Type) but is missing Title, so
    // parseImdbRatings throws from inside importFiles' try.
    const outcome = await importFiles([file('ratings.csv', 'Const,Title Type\ntt0133093,Movie\n')]);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.message).toBe('This file is missing the column(s): Title.');
    expect(outcome.hint).toBe(
      'Export "Your Ratings" from IMDb, or any of your lists, and upload the .csv file it produces.',
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
    // Same 6 + 5 with three overlaps as the loose-files case, so the archive's
    // contents are going through the very same merge.
    expect(outcome.films).toHaveLength(8);
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
