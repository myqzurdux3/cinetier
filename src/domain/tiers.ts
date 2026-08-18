import type { Film } from './film';

export interface Tier {
  id: string;
  label: string;
  color: string;
  /** Lowest normalized rating that lands in this tier; null means "everything remaining". */
  minRating: number | null;
}

export const DEFAULT_TIERS: Tier[] = [
  { id: 'S', label: 'S', color: 'var(--color-tier-s)', minRating: 90 },
  { id: 'A', label: 'A', color: 'var(--color-tier-a)', minRating: 80 },
  { id: 'B', label: 'B', color: 'var(--color-tier-b)', minRating: 70 },
  { id: 'C', label: 'C', color: 'var(--color-tier-c)', minRating: 60 },
  { id: 'D', label: 'D', color: 'var(--color-tier-d)', minRating: 50 },
  { id: 'F', label: 'F', color: 'var(--color-tier-f)', minRating: null },
];

export interface TierBoard {
  tiers: Tier[];
  /** Tier id -> ordered film ids. */
  placements: Record<string, string[]>;
  /** Film ids not yet placed in any tier. */
  pool: string[];
}

function emptyPlacements(tiers: Tier[]): Record<string, string[]> {
  return Object.fromEntries(tiers.map((tier) => [tier.id, []]));
}

/** A board with every film in the pool, for users who prefer to rank from scratch. */
export function createEmptyBoard(films: Film[], tiers: Tier[] = DEFAULT_TIERS): TierBoard {
  return { tiers, placements: emptyPlacements(tiers), pool: films.map((film) => film.id) };
}

function tierForRating(rating: number, tiers: Tier[]): Tier | undefined {
  return tiers.find((tier) => tier.minRating === null || rating >= tier.minRating);
}

/** A board pre-filled from imported ratings. Unrated films stay in the pool. */
export function autoFillBoard(films: Film[], tiers: Tier[] = DEFAULT_TIERS): TierBoard {
  const placements = emptyPlacements(tiers);
  const pool: string[] = [];

  const sorted = [...films].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));

  for (const film of sorted) {
    if (film.rating === null) {
      pool.push(film.id);
      continue;
    }
    const tier = tierForRating(film.rating, tiers);
    if (tier) placements[tier.id]!.push(film.id);
    else pool.push(film.id);
  }

  return { tiers, placements, pool };
}

/**
 * Move a film to a position in a tier, or back to the pool when toTierId is null.
 * Returns a new board; the input is never mutated.
 */
export function moveFilm(
  board: TierBoard,
  filmId: string,
  toTierId: string | null,
  toIndex: number,
): TierBoard {
  const placements: Record<string, string[]> = Object.fromEntries(
    Object.entries(board.placements).map(([id, ids]) => [id, ids.filter((f) => f !== filmId)]),
  );
  const pool = board.pool.filter((id) => id !== filmId);

  if (toTierId === null) {
    pool.splice(Math.max(0, Math.min(toIndex, pool.length)), 0, filmId);
  } else {
    const target = placements[toTierId];
    if (!target) return board;
    target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, filmId);
  }

  return { tiers: board.tiers, placements, pool };
}
