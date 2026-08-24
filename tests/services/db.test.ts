import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB, type DBSchema } from 'idb';
import { db, resetDatabase } from '@/services/db';

// v1's shape, reproduced by hand exactly as library.test.ts's upgrade test
// does — see that file's own comment for why this bypasses db() entirely.
interface CinetierV1Schema extends DBSchema {
  tmdb: { key: string; value: { match: unknown; fetchedAt: number } };
  library: { key: string; value: { films: unknown[]; savedAt: number } };
}

beforeEach(async () => {
  await resetDatabase();
});

describe('a version bump blocked by a connection open elsewhere', () => {
  it('logs so the stall is not silent, and still resolves once the other connection closes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // A v1 connection deliberately left open — standing in for a second tab
    // still on the old version. Real IndexedDB (and fake-indexeddb, which
    // implements the same algorithm) refuses to run the v2 upgrade while
    // this is open, and fires 'blocked' on the new request instead. Without
    // a handler, db()'s returned promise would simply never settle: nothing
    // resolves, nothing rejects, nothing is logged, and loadLibrary /
    // loadFilters hang forever with no trace of why.
    const v1 = await openDB<CinetierV1Schema>('cinetier', 1, {
      upgrade(database) {
        database.createObjectStore('tmdb');
        database.createObjectStore('library');
      },
    });

    const opening = db();

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });
    const [message] = consoleError.mock.calls[0] as [string];
    expect(message).toMatch(/blocked/i);

    // Closing the blocking connection is what lets the real browser (and
    // fake-indexeddb) finally proceed with the upgrade.
    v1.close();
    const opened = await opening;
    expect(opened.version).toBe(4);

    consoleError.mockRestore();
  });
});
