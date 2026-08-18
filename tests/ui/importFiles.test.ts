import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importFiles } from '@/ui/import/importFiles';

const imdbCsv = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');
const diaryCsv = readFileSync('tests/fixtures/letterboxd-diary.csv', 'utf8');

function file(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
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

  it('reports an unrecognisable file with a hint rather than a stack trace', async () => {
    const outcome = await importFiles([file('holiday-photos.csv', 'a,b,c\n1,2,3')]);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.message).toMatch(/holiday-photos\.csv/);
    expect(outcome.hint).toMatch(/IMDb|Letterboxd/);
  });

  it('reports an empty selection', async () => {
    const outcome = await importFiles([]);
    expect(outcome.status).toBe('error');
  });
});
