import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TmdbMatch, TmdbDetails } from './tmdb';
import type { Film } from '@/domain/film';
import type { FilterCriteria } from '@/domain/filters';
import type { TierBoard } from '@/domain/tiers';

export interface CinetierDB extends DBSchema {
  tmdb: {
    key: string;
    value: { match: TmdbMatch | null; fetchedAt: number };
  };
  tmdbDetails: {
    key: string;
    value: { details: TmdbDetails | null; fetchedAt: number };
  };
  library: {
    key: string;
    value: { films: Film[]; savedAt: number };
  };
  filters: {
    key: string;
    value: { criteria: FilterCriteria; savedAt: number };
  };
  boards: {
    key: string;
    value: TierBoard;
  };
  /**
   * Small named values that are neither the library nor a board: at the moment
   * only which board the user was last looking at. A store of its own rather
   * than a corner of another one, so a later setting does not have to pretend
   * to be a filter or a board to get saved.
   */
  settings: {
    key: string;
    value: string;
  };
}

const NAME = 'cinetier';
const VERSION = 4;

const STORES = ['tmdb', 'tmdbDetails', 'library', 'filters', 'boards', 'settings'] as const;

let connection: Promise<IDBPDatabase<CinetierDB>> | null = null;

export function db(): Promise<IDBPDatabase<CinetierDB>> {
  connection ??= openDB<CinetierDB>(NAME, VERSION, {
    upgrade(database) {
      // createObjectStore throws on a store that already exists, and anyone
      // who has visited before arrives here with two of these already made.
      // Creating what is missing is version-independent, so a later bump does
      // not have to know which version each visitor is coming from.
      for (const store of STORES) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
      }
    },
    // 1 -> 2 is the first version bump this app has ever shipped, which makes
    // this the first time a returning user with two tabs open can hit this:
    // tab A still holds a v1 connection, so tab B's upgrade cannot proceed.
    // Without this handler, openDB's returned promise simply never settles —
    // it neither resolves nor rejects — so loadLibrary/loadFilters hang
    // forever, `films` stays null, and the user lands on the import screen
    // looking like their library vanished, with nothing in the UI or the
    // console to say why. This can't unblock the hang (only closing the other
    // tab can), but it at least says what happened.
    blocked(currentVersion, blockedVersion) {
      console.error(
        `IndexedDB upgrade to v${String(blockedVersion)} is blocked by a connection still open ` +
          `at v${String(currentVersion)} — probably another tab with this app open. ` +
          'Close it (or reload it) to continue.',
      );
    },
    // The browser dropping the connection out from under us, not db.close().
    // The memoised promise above is already resolved to a database handle
    // that is now dead, so forgetting it here is what makes the *next* db()
    // call open a fresh connection instead of every future read and write
    // failing against a closed one for the rest of the session.
    terminated() {
      console.error('The IndexedDB connection was terminated unexpectedly.');
      connection = null;
    },
  });
  return connection;
}

/** Drop everything. Used by tests, and by the interface's "start over" action. */
export async function resetDatabase(): Promise<void> {
  if (connection) (await connection).close();
  connection = null;
  await deleteDB(NAME);
}
