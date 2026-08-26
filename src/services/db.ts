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
    /**
     * `version` stamps the shape of `films`. Optional because records written
     * before the stamp existed have none, and their shape is the one version 1
     * describes — see services/library.ts.
     */
    value: { version?: number; films: Film[]; savedAt: number };
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

/** `v4`, or `an unknown version` — idb types the blocked version `number | null`. */
const describeVersion = (version: number | null) =>
  version === null ? 'an unknown version' : `v${String(version)}`;

/**
 * Why the database is not answering, when it is not answering.
 *
 * A blocked upgrade is the one failure that produces no error at all: openDB's
 * promise neither resolves nor rejects, so every read hangs, `films` stays
 * null, and the user is shown the import screen — which looks exactly like a
 * library that vanished. The console said what happened; nothing on the screen
 * did. This is how the screen gets to.
 */
export type DatabaseStall =
  | { reason: 'blocked'; openVersion: number }
  /**
   * A stored record stamped by a build newer than this one. Reading it as
   * today's shape is what a version stamp exists to prevent, so the read
   * refuses — and refusing silently would put the user back on the import
   * screen with their library apparently gone, which is the same lie the
   * blocked case used to tell.
   */
  | { reason: 'newer'; store: string }
  | null;

let stall: DatabaseStall = null;
const watchers = new Set<(stalled: DatabaseStall) => void>();

/** What is wrong right now, for a component mounting after the fact. */
export const databaseStall = (): DatabaseStall => stall;

/** Notified whenever that changes. Returns its own unsubscribe. */
export function watchDatabaseStall(watcher: (stalled: DatabaseStall) => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

/** For the stores, which discover the second kind of stall on the way out. */
export function reportDatabaseStall(next: DatabaseStall): void {
  reportStall(next);
}

function reportStall(next: DatabaseStall): void {
  if (stall === null && next === null) return;
  stall = next;
  for (const watcher of watchers) watcher(next);
}

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
      reportStall({ reason: 'blocked', openVersion: currentVersion });
      console.error(
        `IndexedDB upgrade to ${describeVersion(blockedVersion)} is blocked by a connection ` +
          `still open at v${String(currentVersion)} — probably another tab with this app ` +
          'open. Close it (or reload it) to continue.',
      );
    },
    // The other side of the same stall. `blocked` fires on the tab that is
    // waiting; this fires on the tab that is in the way, and closing the
    // connection here is the only thing that lets the other tab through.
    //
    // It cannot help the transition that first raised this — the blocking tab
    // is running the old bundle, which has no such handler — but it is what
    // stops the next version bump from reproducing it. This tab's connection
    // is gone afterwards, and reopening it from an older bundle would ask for
    // a version below the one on disk and fail, so what this tab needs is a
    // reload.
    blocking(currentVersion, blockedVersion) {
      console.warn(
        `Closing this tab's IndexedDB connection (v${String(currentVersion)}) so another tab ` +
          `can upgrade to ${describeVersion(blockedVersion)}. Reload this tab to continue.`,
      );
      const open = connection;
      connection = null;
      void open?.then((database) => {
        database.close();
      });
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
  })
    .then((database) => {
      // The other tab was closed and the upgrade went through. Whatever the
      // screen is saying about a stall stops being true here.
      reportStall(null);
      return database;
    })
    .catch((error: unknown) => {
      // Memoising a *rejected* promise is what made a single bad open —
      // private browsing, a quota refusal, a blocked upgrade — permanent:
      // every later read and write in the session reused it and failed, with
      // no way back short of a reload. Forgetting it lets the next call try
      // again. The failure is still raised to this caller.
      connection = null;
      throw error;
    });
  return connection;
}

/** Drop everything. Used by tests, and by the interface's "start over" action. */
export async function resetDatabase(): Promise<void> {
  if (connection) (await connection).close();
  connection = null;
  await deleteDB(NAME, {
    // A delete is blocked by exactly what an upgrade is, and hangs the same
    // way: the returned promise never settles, and "start over" appears to do
    // nothing at all.
    blocked(currentVersion) {
      console.error(
        `Deleting the database is blocked by a connection still open at ` +
          `v${String(currentVersion)} — probably another tab with this app open. ` +
          'Close it (or reload it) to continue.',
      );
    },
  });
}
