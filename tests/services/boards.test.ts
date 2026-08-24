import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import {
  saveBoard,
  loadBoard,
  loadCurrentBoard,
  listBoards,
  deleteBoard,
  saveCurrentBoardId,
  newBoardId,
  clearBoards,
} from '@/services/boards';
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

  it('loadCurrentBoard returns null when there are none', async () => {
    expect(await loadCurrentBoard()).toBeNull();
  });

  it('loadCurrentBoard returns the only board there is', async () => {
    await saveBoard(createBoard('b1', 'Mine'));
    expect((await loadCurrentBoard())?.id).toBe('b1');
  });

  it('clearBoards removes every board', async () => {
    await saveBoard(createBoard('b1', 'One'));
    await saveBoard(createBoard('b2', 'Two'));
    await clearBoards();
    expect(await loadCurrentBoard()).toBeNull();
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

    expect(upgraded.version).toBe(4);
    expect(Array.from(upgraded.objectStoreNames).sort()).toEqual([
      'boards',
      'filters',
      'library',
      'settings',
      'tmdb',
      'tmdbDetails',
    ]);
    expect(await upgraded.get('library', 'current')).toEqual(saved);
    expect((await upgraded.get('filters', 'current'))?.criteria).toEqual({ minRating: 80 });
  });
});

describe('the v3 to v4 schema upgrade', () => {
  it('keeps a saved board when the settings store is added', async () => {
    // The third bump. Named boards needed somewhere to remember which board
    // the user was last looking at, and a board is not the place to keep an
    // answer about the collection it belongs to.
    const v3 = await openDB('cinetier', 3, {
      upgrade(database) {
        for (const store of ['tmdb', 'tmdbDetails', 'library', 'filters', 'boards']) {
          if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
        }
      },
    });
    const board = moveFilm(createBoard('b1', 'Mine'), 'film-1', { tierId: 'S', index: 0 });
    try {
      await v3.put('boards', board, board.id);
    } finally {
      v3.close();
    }

    const upgraded = await db();

    expect(upgraded.version).toBe(4);
    expect(Array.from(upgraded.objectStoreNames)).toContain('settings');
    expect(await upgraded.get('boards', 'b1')).toEqual(board);
    // Nothing was current before there was anywhere to say so, and the
    // fallback is what puts the one saved board in front of the user anyway.
    expect(await upgraded.get('settings', 'currentBoardId')).toBeUndefined();
    expect((await loadCurrentBoard())?.id).toBe('b1');
  });
});

describe('the board collection', () => {
  it('lists nothing when nothing was saved', async () => {
    expect(await listBoards()).toEqual([]);
  });

  it('lists every saved board', async () => {
    await saveBoard(createBoard('b1', 'One'));
    await saveBoard(createBoard('b2', 'Two'));
    expect((await listBoards()).map((board) => board.id).sort()).toEqual(['b1', 'b2']);
  });

  it('deletes one board and leaves the rest', async () => {
    await saveBoard(createBoard('b1', 'One'));
    await saveBoard(createBoard('b2', 'Two'));
    await deleteBoard('b1');
    expect((await listBoards()).map((board) => board.id)).toEqual(['b2']);
  });

  it('deleting a board that is not there is not an error', async () => {
    await saveBoard(createBoard('b1', 'One'));
    await deleteBoard('nope');
    expect((await listBoards()).map((board) => board.id)).toEqual(['b1']);
  });

  it('remembers which board was current', async () => {
    await saveBoard(createBoard('b1', 'One'));
    await saveBoard(createBoard('b2', 'Two'));
    await saveCurrentBoardId('b2');
    expect((await loadCurrentBoard())?.id).toBe('b2');
  });

  it('falls back to the oldest board when the remembered one is gone', async () => {
    // Deleted in another tab, or lost to a failed write. Returning nothing
    // would put an empty default board in front of someone who has one saved.
    await saveBoard(createBoard('b1', 'One'));
    await saveCurrentBoardId('b-deleted');
    expect((await loadCurrentBoard())?.id).toBe('b1');
  });

  it('remembers nothing across a reset', async () => {
    await saveBoard(createBoard('b1', 'One'));
    await saveCurrentBoardId('b1');
    await clearBoards();
    expect(await loadCurrentBoard()).toBeNull();
  });
});

describe('newBoardId', () => {
  it('gives a different id every time', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newBoardId()));
    expect(ids.size).toBe(200);
  });

  it('sorts after an id made earlier', async () => {
    // `getAll` returns records in key order, so the ids decide the order the
    // picker lists boards in, and that order should be the order they were
    // made in.
    const first = newBoardId();
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(newBoardId() > first).toBe(true);
  });

  it('sorts after the id the very first saved board was given', () => {
    // That board is called `board-1`, from before there was more than one.
    expect(newBoardId() > 'board-1').toBe(true);
  });
});
