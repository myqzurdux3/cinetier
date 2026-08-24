import { db } from './db';
import type { TierBoard } from '@/domain/tiers';

export async function saveBoard(board: TierBoard): Promise<void> {
  await (await db()).put('boards', board, board.id);
}

export async function loadBoard(id: string): Promise<TierBoard | null> {
  return (await (await db()).get('boards', id)) ?? null;
}

/**
 * The board to show when nothing says which one. Plan A never creates a second
 * board, so this is simply "the board" until named boards arrive and replace
 * this with a remembered id.
 */
export async function loadFirstBoard(): Promise<TierBoard | null> {
  const all = await (await db()).getAll('boards');
  return all[0] ?? null;
}

export async function clearBoards(): Promise<void> {
  await (await db()).clear('boards');
}
