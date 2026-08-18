import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TmdbMatch } from './tmdb';
import type { Film } from '@/domain/film';

export interface CinetierDB extends DBSchema {
  tmdb: {
    key: string;
    value: { match: TmdbMatch | null; fetchedAt: number };
  };
  library: {
    key: string;
    value: { films: Film[]; savedAt: number };
  };
}

const NAME = 'cinetier';
const VERSION = 1;

let connection: Promise<IDBPDatabase<CinetierDB>> | null = null;

export function db(): Promise<IDBPDatabase<CinetierDB>> {
  connection ??= openDB<CinetierDB>(NAME, VERSION, {
    upgrade(database) {
      database.createObjectStore('tmdb');
      database.createObjectStore('library');
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
