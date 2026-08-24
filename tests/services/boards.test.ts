import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { saveBoard, loadBoard, loadFirstBoard, clearBoards } from '@/services/boards';
import { db, resetDatabase } from '@/services/db';
import { createBoard, moveFilm } from '@/domain/tiers';

beforeEach(async () => {
  await resetDatabase();
});

describe('board persistence', () => {
  it('round-trips a board', async () => {
    const board = moveFilm(createBoard('b1', 'Mine'), 'film-1', { tierId: 'S', index: 0 });
    await saveBoard(board);
    expect(await loadBoard('b1')).toEqual(board);
  });

  it('returns null for a board that was never saved', async () => {
    expect(await loadBoard('nope')).toBeNull();
  });

  it('overwrites a board saved under the same id', async () => {
    await saveBoard(createBoard('b1', 'First'));
    await saveBoard(createBoard('b1', 'Second'));
    expect((await loadBoard('b1'))?.name).toBe('Second');
    expect(await (await db()).count('boards')).toBe(1);
  });

  it('loadFirstBoard returns null when there are none', async () => {
    expect(await loadFirstBoard()).toBeNull();
  });

  it('loadFirstBoard returns the only board there is', async () => {
    await saveBoard(createBoard('b1', 'Mine'));
    expect((await loadFirstBoard())?.id).toBe('b1');
  });

  it('clearBoards removes every board', async () => {
    await saveBoard(createBoard('b1', 'One'));
    await saveBoard(createBoard('b2', 'Two'));
    await clearBoards();
    expect(await loadFirstBoard()).toBeNull();
  });
});

describe('the v2 to v3 schema upgrade', () => {
  it('keeps an existing library and filters intact when boards is added', async () => {
    // fake-indexeddb is fresh every run, so an upgrade is never exercised
    // unless a test builds the older database by hand first. This is the
    // second bump; the first (v1 to v2) is covered in library.test.ts.
    const v2 = await openDB('cinetier', 2, {
      upgrade(database) {
        for (const store of ['tmdb', 'tmdbDetails', 'library', 'filters']) {
          if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
        }
      },
    });
    const saved = { films: [], savedAt: 1_700_000_000_000 };
    try {
      await v2.put('library', saved, 'current');
      await v2.put('filters', { criteria: { minRating: 80 }, savedAt: 1 }, 'current');
    } finally {
      // Without this, a failed put leaves the connection open and the next
      // beforeEach's deleteDB blocks — the suite hangs instead of going red.
      v2.close();
    }

    const upgraded = await db();

    expect(upgraded.version).toBe(3);
    expect(Array.from(upgraded.objectStoreNames).sort()).toEqual([
      'boards',
      'filters',
      'library',
      'tmdb',
      'tmdbDetails',
    ]);
    expect(await upgraded.get('library', 'current')).toEqual(saved);
    expect((await upgraded.get('filters', 'current'))?.criteria).toEqual({ minRating: 80 });
  });
});
