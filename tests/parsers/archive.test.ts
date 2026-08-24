import { describe, it, expect } from 'vitest';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { readLetterboxdArchive } from '@/parsers/archive';

async function makeArchive(entries: Record<string, string>): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'));
  for (const [name, content] of Object.entries(entries)) {
    await writer.add(name, new TextReader(content));
  }
  return writer.close();
}

describe('readLetterboxdArchive', () => {
  it('picks out the three files it needs and ignores the rest', async () => {
    const archive = await makeArchive({
      'diary.csv': 'diary contents',
      'ratings.csv': 'ratings contents',
      'watched.csv': 'watched contents',
      'profile.csv': 'ignored',
      'reviews.csv': 'ignored',
    });

    const files = await readLetterboxdArchive(archive);

    expect(files.diary).toBe('diary contents');
    expect(files.ratings).toBe('ratings contents');
    expect(files.watched).toBe('watched contents');
  });

  it('finds the files inside a nested folder, which is how Letterboxd ships them', async () => {
    const archive = await makeArchive({ 'letterboxd-user-2026/diary.csv': 'diary contents' });
    const files = await readLetterboxdArchive(archive);
    expect(files.diary).toBe('diary contents');
  });

  it('rejects an archive with none of the expected files, naming what it wanted', async () => {
    const archive = await makeArchive({ 'notes.txt': 'nothing useful' });
    await expect(readLetterboxdArchive(archive)).rejects.toThrow(/diary\.csv/);
  });
});
