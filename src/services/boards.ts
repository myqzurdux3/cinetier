import { db } from './db';
import type { TierBoard } from '@/domain/tiers';

export async function saveBoard(board: TierBoard): Promise<void> {
  await (await db()).put('boards', board, board.id);
}

export async function loadBoard(id: string): Promise<TierBoard | null> {
  return (await (await db()).get('boards', id)) ?? null;
}

/** Every saved board, oldest first — the order they were created in. */
export async function listBoards(): Promise<TierBoard[]> {
  return (await db()).getAll('boards');
}

export async function deleteBoard(id: string): Promise<void> {
  await (await db()).delete('boards', id);
}

/**
 * An id for a new board that sorts after every id made before it.
 *
 * `getAll` on a store with no index returns records in key order, so the ids
 * are what decides the order boards appear in the picker. A timestamp in
 * base 36 makes that order the order they were created in; the random tail
 * keeps two boards made in the same millisecond apart. The very first board
 * this application ever saved is called `board-1`, and sorts before all of
 * these, which is where it belongs.
 */
export function newBoardId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const CURRENT_BOARD = 'currentBoardId';

export async function saveCurrentBoardId(id: string): Promise<void> {
  await (await db()).put('settings', id, CURRENT_BOARD);
}

/**
 * The board the user was last looking at.
 *
 * Falls back to the oldest saved board when the remembered id names one that
 * is gone — deleted in another tab, or lost to a failed write — rather than
 * returning nothing and putting an empty default board in front of someone who
 * has one saved.
 */
export async function loadCurrentBoard(): Promise<TierBoard | null> {
  const all = await listBoards();
  if (all.length === 0) return null;
  const remembered = await (await db()).get('settings', CURRENT_BOARD);
  return all.find((board) => board.id === remembered) ?? all[0] ?? null;
}

export async function clearBoards(): Promise<void> {
  await (await db()).clear('boards');
}
