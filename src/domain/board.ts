import type { Film } from './film';
import {
  clearToPool,
  moveFilm,
  prefill,
  type Destination,
  type TierBoard,
  type TierColor,
} from './tiers';

export type BoardAction =
  | { type: 'move'; filmId: string; to: Destination }
  | { type: 'prefill'; films: Film[] }
  | { type: 'clearToPool' }
  | { type: 'addTier'; afterTierId: string | null }
  | { type: 'removeTier'; tierId: string }
  | { type: 'moveTier'; tierId: string; toIndex: number }
  | { type: 'renameTier'; tierId: string; label: string }
  | { type: 'recolorTier'; tierId: string; color: TierColor }
  | { type: 'setThreshold'; tierId: string; minRating: number | null }
  | { type: 'renameBoard'; name: string };

/** An id no current row is using. Ids are internal; the label is what users see. */
function freshTierId(board: TierBoard): string {
  const taken = new Set(board.tiers.map((tier) => tier.id));
  let n = board.tiers.length + 1;
  while (taken.has(`tier-${String(n)}`)) n += 1;
  return `tier-${String(n)}`;
}

type TierShape = TierBoard['tiers'][number];

/**
 * Field-by-field, because the point is to recognise a change that produced an
 * equal row. Adding a field to `Tier` means adding it here — the alternative,
 * a generic key walk, would silently keep working while comparing less than it
 * claims to.
 */
function sameTier(a: TierShape, b: TierShape): boolean {
  return a.id === b.id && a.label === b.label && a.color === b.color && a.minRating === b.minRating;
}

function withTier(
  board: TierBoard,
  tierId: string,
  change: (tier: TierShape) => TierShape,
): TierBoard {
  const current = board.tiers.find((tier) => tier.id === tierId);
  if (!current) return board;
  const changed = change(current);
  // Setting a row's label, colour or threshold to what it already holds is
  // not an edit. Returning the input reference is what lets App's history skip
  // it — see the guard in `dispatch`.
  if (sameTier(current, changed)) return board;
  return { ...board, tiers: board.tiers.map((tier) => (tier.id === tierId ? changed : tier)) };
}

export function boardReducer(board: TierBoard, action: BoardAction): TierBoard {
  switch (action.type) {
    case 'move':
      return moveFilm(board, action.filmId, action.to);

    case 'prefill':
      return prefill(board, action.films);

    case 'clearToPool':
      return clearToPool(board);

    case 'addTier': {
      const id = freshTierId(board);
      const at = board.tiers.findIndex((tier) => tier.id === action.afterTierId);
      const index = at === -1 ? board.tiers.length : at + 1;
      const tiers = [...board.tiers];
      tiers.splice(index, 0, { id, label: 'New', color: 'f', minRating: null });
      // A row with no placements entry cannot be dropped into, so it is created
      // alongside the row rather than lazily on first drop.
      return { ...board, tiers, placements: { ...board.placements, [id]: [] } };
    }

    case 'removeTier': {
      if (!board.tiers.some((tier) => tier.id === action.tierId)) return board;
      // A board with no rows has nowhere to drop anything and no way back.
      if (board.tiers.length === 1) return board;
      const tiers = board.tiers.filter((tier) => tier.id !== action.tierId);
      const placements = { ...board.placements };
      // Dropping the entry is what returns its films to the pool, since the
      // pool is everything the library holds and no tier lists.
      delete placements[action.tierId];
      return { ...board, tiers, placements };
    }

    case 'moveTier': {
      const from = board.tiers.findIndex((tier) => tier.id === action.tierId);
      if (from === -1) return board;
      const tiers = [...board.tiers];
      const [moved] = tiers.splice(from, 1);
      if (!moved) return board;
      const to = Math.max(0, Math.min(action.toIndex, tiers.length));
      tiers.splice(to, 0, moved);
      // Moving a row to the index it already occupies — the clamp makes this
      // reachable from the first row's "up" and the last row's "down" — leaves
      // the order untouched, so it is not an undo step.
      if (to === from) return board;
      return { ...board, tiers };
    }

    case 'renameTier':
      return withTier(board, action.tierId, (tier) => ({ ...tier, label: action.label }));

    case 'recolorTier':
      return withTier(board, action.tierId, (tier) => ({ ...tier, color: action.color }));

    case 'setThreshold':
      return withTier(board, action.tierId, (tier) => ({ ...tier, minRating: action.minRating }));

    case 'renameBoard':
      return action.name === board.name ? board : { ...board, name: action.name };
  }
}
