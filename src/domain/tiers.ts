import type { Film } from './film';

/**
 * The theme's tier tokens, by name. The domain names the token; the UI turns
 * `'s'` into `var(--color-tier-s)`. Keeping the value out of here is what lets
 * a row be recoloured without putting a colour literal in either layer.
 */
export const TIER_COLORS = ['s', 'a', 'b', 'c', 'd', 'f'] as const;
export type TierColor = (typeof TIER_COLORS)[number];

export interface Tier {
  id: string;
  label: string;
  color: TierColor;
  /** Lowest normalized rating that lands in this tier; null means "everything remaining". */
  minRating: number | null;
}

export const DEFAULT_TIERS: Tier[] = [
  { id: 'S', label: 'S', color: 's', minRating: 90 },
  { id: 'A', label: 'A', color: 'a', minRating: 80 },
  { id: 'B', label: 'B', color: 'b', minRating: 70 },
  { id: 'C', label: 'C', color: 'c', minRating: 60 },
  { id: 'D', label: 'D', color: 'd', minRating: 50 },
  { id: 'F', label: 'F', color: 'f', minRating: null },
];

export interface TierBoard {
  id: string;
  name: string;
  tiers: Tier[];
  /**
   * Tier id -> ordered film ids. A film the library holds and no tier lists is
   * in the pool; the pool is never stored, because storing it would be a second
   * source of truth for that one fact.
   */
  placements: Record<string, string[]>;
}

/** Where a film is going: a position in a tier, or back to the pool. */
export type Destination = { tierId: string; index: number } | 'pool';

function emptyPlacements(tiers: Tier[]): Record<string, string[]> {
  return Object.fromEntries(tiers.map((tier) => [tier.id, []]));
}

/**
 * Whether two placement maps hold the same rows in the same order.
 *
 * This exists so an operation that changes nothing can return its input
 * *reference*: App's undo history skips recording when the reducer hands back
 * the board it was given, and that guard only bites if the operations are
 * honest about doing nothing. Comparing here rather than in the UI keeps the
 * cost where the work already is — every caller below has just walked the same
 * placements once, so this walk is the same order of magnitude, not a new one.
 */
function samePlacements(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const left = a[key];
    const right = b[key];
    if (left === undefined || right === undefined) return false;
    return left.length === right.length && left.every((id, index) => id === right[index]);
  });
}

export function createBoard(id: string, name: string, tiers: Tier[] = DEFAULT_TIERS): TierBoard {
  return { id, name, tiers, placements: emptyPlacements(tiers) };
}

/** Every film id the board has placed somewhere. */
export function placedIds(board: TierBoard): Set<string> {
  return new Set(Object.values(board.placements).flat());
}

/**
 * The pool: the library minus everything placed, in the library's own order.
 *
 * A placement naming a film the library no longer holds simply contributes
 * nothing here — it is not an error and it is not cleaned up, so re-importing
 * that film later puts it back where it was.
 */
export function poolFor(board: TierBoard, films: Film[]): Film[] {
  const placed = placedIds(board);
  return films.filter((film) => !placed.has(film.id));
}

/**
 * Move a film to a destination. Returns a new board; the input is untouched.
 *
 * Deliberately does not check that the film exists: once the pool is derived,
 * the board holds no library to check against, and a placement pointing at a
 * film nobody has is already a state this design supports (see poolFor).
 */
export function moveFilm(board: TierBoard, filmId: string, to: Destination): TierBoard {
  if (to !== 'pool' && !board.tiers.some((tier) => tier.id === to.tierId)) return board;

  const placements: Record<string, string[]> = Object.fromEntries(
    Object.entries(board.placements).map(([id, ids]) => [id, ids.filter((f) => f !== filmId)]),
  );

  if (to !== 'pool') {
    const target = placements[to.tierId] ?? [];
    target.splice(Math.max(0, Math.min(to.index, target.length)), 0, filmId);
    placements[to.tierId] = target;
  }

  // Dropping a film back exactly where it already was is a real gesture — a
  // drag that travels and returns, or the keyboard's first arrow press before
  // the fix above — and it must not become an undo step.
  if (samePlacements(board.placements, placements)) return board;

  return { ...board, placements };
}

function tierForRating(rating: number, tiers: Tier[]): Tier | undefined {
  return tiers.find((tier) => tier.minRating === null || rating >= tier.minRating);
}

/**
 * Fill the tiers from the pool, using each tier's threshold.
 *
 * Only pooled films move: a film already placed by hand keeps its row, because
 * pre-filling is an aid to a ranking in progress, not a reset of one. Unrated
 * films stay pooled, since a rating is what this sorts by.
 */
export function prefill(board: TierBoard, films: Film[]): TierBoard {
  const pooled = poolFor(board, films)
    .filter((film): film is Film & { rating: number } => film.rating !== null)
    .sort((a, b) => b.rating - a.rating);

  let next = board;
  for (const film of pooled) {
    const tier = tierForRating(film.rating, next.tiers);
    if (!tier) continue;
    const length = next.placements[tier.id]?.length ?? 0;
    next = moveFilm(next, film.id, { tierId: tier.id, index: length });
  }
  return next;
}

/** Send everything back to the pool, keeping the rows themselves. */
export function clearToPool(board: TierBoard): TierBoard {
  const placements = emptyPlacements(board.tiers);
  // Already empty: the button is always offered, so pressing it on an empty
  // board is easy to do and must not cost an undo step.
  if (samePlacements(board.placements, placements)) return board;
  return { ...board, placements };
}
