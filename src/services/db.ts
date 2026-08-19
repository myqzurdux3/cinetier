import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TmdbMatch, TmdbDetails } from './tmdb';
import type { Film } from '@/domain/film';
import type { FilterCriteria } from '@/domain/filters';

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
}

const NAME = 'cinetier';
const VERSION = 2;

const STORES = ['tmdb', 'tmdbDetails', 'library', 'filters'] as const;

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
  });
  return connection;
}

/** Drop everything. Used by tests, and by the interface's "start over" action. */
export async function resetDatabase(): Promise<void> {
  if (connection) (await connection).close();
  connection = null;
  await deleteDB(NAME);
}
