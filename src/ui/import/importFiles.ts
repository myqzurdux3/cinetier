import type { Film } from '@/domain/film';
import { mergeLibraries } from '@/domain/dedupe';
import { parseImdbRatings } from '@/parsers/imdb';
import { parseLetterboxdExport, type LetterboxdFiles } from '@/parsers/letterboxd';
import { readLetterboxdArchive } from '@/parsers/archive';
import { ParseError } from '@/parsers/types';

export type ImportOutcome =
  | { status: 'ok'; films: Film[]; warnings: string[] }
  | { status: 'error'; message: string; hint: string };

const GENERIC_HINT =
  'Drop an IMDb ratings.csv, or a Letterboxd export .zip — or the diary.csv, ratings.csv and watched.csv from inside it.';

/** An IMDb ratings export is identified by its columns, since its name varies. */
function looksLikeImdb(header: string): boolean {
  return header.includes('Const') && header.includes('Your Rating');
}

function letterboxdSlot(name: string): keyof LetterboxdFiles | null {
  const base = name.toLowerCase();
  if (base.includes('diary')) return 'diary';
  if (base.includes('watched')) return 'watched';
  if (base.includes('ratings')) return 'ratings';
  return null;
}

/**
 * Turn whatever the user dropped into one merged library.
 * Files are classified by content first and by name second, because browsers
 * rename downloads and users rename files.
 */
export async function importFiles(files: File[]): Promise<ImportOutcome> {
  if (files.length === 0) {
    return { status: 'error', message: 'No file was selected.', hint: GENERIC_HINT };
  }

  const libraries: Film[][] = [];
  const warnings: string[] = [];
  const letterboxd: LetterboxdFiles = {};

  try {
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        Object.assign(letterboxd, await readLetterboxdArchive(file));
        continue;
      }

      const text = await file.text();
      const header = text.slice(0, text.indexOf('\n'));

      if (looksLikeImdb(header)) {
        const result = parseImdbRatings(text);
        libraries.push(result.films);
        warnings.push(...result.warnings);
        continue;
      }

      const slot = letterboxdSlot(file.name);
      if (slot) {
        letterboxd[slot] = text;
        continue;
      }

      return {
        status: 'error',
        message: `I could not tell what "${file.name}" is.`,
        hint: GENERIC_HINT,
      };
    }

    if (letterboxd.diary || letterboxd.ratings || letterboxd.watched) {
      const result = parseLetterboxdExport(letterboxd);
      libraries.push(result.films);
      warnings.push(...result.warnings);
    }

    return { status: 'ok', films: mergeLibraries(...libraries), warnings };
  } catch (error) {
    if (error instanceof ParseError) {
      return { status: 'error', message: error.message, hint: error.hint };
    }
    return {
      status: 'error',
      message: 'Something went wrong reading that file.',
      hint: GENERIC_HINT,
    };
  }
}
