import { BlobReader, TextWriter, ZipReader, configure } from '@zip.js/zip.js';
import { ParseError } from './types';
import type { LetterboxdFiles } from './letterboxd';

// Web workers buy nothing for the handful of small CSV files in a Letterboxd
// export, and they do not exist in the test environment.
configure({ useWebWorkers: false });

const WANTED = ['diary', 'ratings', 'watched'] as const;

const HINT =
  'In Letterboxd, go to Settings > Data > Export your data, then upload the .zip exactly as you received it.';

/**
 * Pull the three CSV files Cinetier reads out of a Letterboxd export archive.
 * Entries live under a dated folder, so matching is done on the base name.
 */
export async function readLetterboxdArchive(archive: Blob): Promise<LetterboxdFiles> {
  const reader = new ZipReader(new BlobReader(archive));
  const files: LetterboxdFiles = {};

  try {
    for (const entry of await reader.getEntries()) {
      if (entry.directory || !entry.getData) continue;
      const base = entry.filename.split('/').pop()?.toLowerCase() ?? '';
      const match = WANTED.find((name) => base === `${name}.csv`);
      if (!match) continue;
      files[match] = await entry.getData(new TextWriter());
    }
  } finally {
    await reader.close();
  }

  if (!files.diary && !files.ratings && !files.watched) {
    throw new ParseError(
      'This archive does not contain diary.csv, ratings.csv or watched.csv.',
      HINT,
    );
  }

  return files;
}
