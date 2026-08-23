import type { Destination, TierBoard } from '@/domain/tiers';

/**
 * What the pointer (or the keyboard cursor) ended over. Deliberately a plain
 * shape rather than dnd-kit's `over` object: everything decided here is
 * decidable from these three cases, and keeping the library's types out means
 * this module is testable without a DOM.
 */
export type DropTarget =
  | { type: 'tier'; tierId: string }
  // tierId is null for a card sitting in the pool, which is what BoardCard
  // passes for its own `data`. Dropping onto such a card means the pool.
  | { type: 'card'; tierId: string | null; filmId: string }
  | { type: 'pool' };

/**
 * Where the dragged film should end up, or null if the drop should be ignored
 * entirely.
 *
 * Null matters as much as the destinations do: dispatching a move that changes
 * nothing would push an identical board onto the undo history, so the next
 * Ctrl+Z would appear to do nothing at all.
 */
export function destinationFor(
  target: DropTarget,
  board: TierBoard,
  draggedId: string,
): Destination | null {
  if (target.type === 'pool') return 'pool';

  // A local variable, rather than re-reading `target.tierId` below: TS widens
  // a union member's property access back to `string | null` once control
  // flow has passed through a compound `&& target.tierId === null` check, so
  // narrowing it here — a plain nullable variable — is what keeps the rest of
  // this function typed as `string` instead of `string | null`.
  const tierId = target.tierId;
  if (tierId === null) return 'pool';

  const ids = board.placements[tierId];
  if (!ids) return null;

  // A film lifted out of this row is no longer occupying a position in it, so
  // every index at or after its old one has already shifted down by one. The
  // drop point the user aimed at is the *post-removal* index.
  const from = ids.indexOf(draggedId);
  const shift = (index: number) => (from !== -1 && from < index ? index - 1 : index);

  if (target.type === 'tier') return { tierId, index: shift(ids.length) };

  if (target.filmId === draggedId) return null;
  const over = ids.indexOf(target.filmId);
  if (over === -1) return null;

  return { tierId, index: shift(over) };
}
