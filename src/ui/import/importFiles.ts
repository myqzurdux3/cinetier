import type { Film } from '@/domain/film';
import { mergeLibraries } from '@/domain/dedupe';
import type { LetterboxdFiles } from '@/parsers/letterboxd';
import { ParseError } from '@/parsers/types';

/*
 * The parsers are loaded when a file is actually dropped, not when the page
 * is. Between them they pull in a CSV parser and a ZIP reader — roughly a
 * third of what the bundle used to weigh — and neither is needed to draw the
 * screen that asks for a file, nor ever again once a library is restored from
 * the browser's own database. `@/parsers/types` stays a static import: it is
 * types plus one small error class, with no dependencies of its own, and
 * `ParseError` has to be nameable in a `catch` before any of this runs.
 */
const imdbParser = () => import('@/parsers/imdb');
const letterboxdParser = () => import('@/parsers/letterboxd');
const archiveReader = () => import('@/parsers/archive');

export type ImportOutcome =
  | { status: 'ok'; films: Film[]; warnings: string[]; skipped: number }
  | { status: 'error'; message: string; hint: string };

const GENERIC_HINT =
  'Drop an IMDb ratings.csv, or a Letterboxd export .zip — or the diary.csv and ratings.csv from inside it.';

/**
 * An IMDb export is identified by its columns, since its name varies — recent
 * exports arrive named after a random identifier. "Your Rating" is not part of
 * the test: a list export has every other column but that one.
 */
function looksLikeImdb(header: string): boolean {
  return header.includes('Const') && header.includes('Title Type');
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
  let skipped = 0;
  const letterboxd: LetterboxdFiles = {};

  try {
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const { readLetterboxdArchive } = await archiveReader();
        Object.assign(letterboxd, await readLetterboxdArchive(file));
        continue;
      }

      const text = await file.text();
      const newline = text.indexOf('\n');
      const header = newline === -1 ? text : text.slice(0, newline);

      if (looksLikeImdb(header)) {
        const { parseImdbRatings } = await imdbParser();
        const result = parseImdbRatings(text);
        libraries.push(result.films);
        warnings.push(...result.warnings);
        skipped += result.skipped;
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
      const { parseLetterboxdExport } = await letterboxdParser();
      const result = parseLetterboxdExport(letterboxd);
      libraries.push(result.films);
      warnings.push(...result.warnings);
      skipped += result.skipped;
    }

    const films = mergeLibraries(...libraries);

    // An import that yields nothing must say so here. Handing an empty library
    // to the next screen shows a blank page that looks like a broken site
    // rather than a file that had nothing importable in it.
    if (films.length === 0) {
      return {
        status: 'error',
        message:
          skipped > 0
            ? `That file held ${skipped} entr${skipped === 1 ? 'y' : 'ies'}, but none of them was a title Cinetier can rank.`
            : 'That file held no titles.',
        hint: GENERIC_HINT,
      };
    }

    return { status: 'ok', films, warnings, skipped };
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
