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

  // Appending to a row the dragged film is already in: it vacates a slot on
  // the way out, so the end of the row is one index earlier than it looks.
  // `moveFilm` clamps an over-long index to the row's length, so both answers
  // land in the same place — this keeps the returned index honest about what
  // it means rather than relying on that clamp.
  const from = ids.indexOf(draggedId);
  if (target.type === 'tier') {
    return { tierId, index: from === -1 ? ids.length : ids.length - 1 };
  }

  if (target.filmId === draggedId) return null;
  const over = ids.indexOf(target.filmId);
  if (over === -1) return null;

  // The over card's index in the row *as it is drawn*, with no correction for
  // the dragged card leaving. `moveFilm` removes the film from every tier
  // before inserting it, exactly as @dnd-kit/sortable's own `arrayMove`
  // splices `from` out before inserting at `to` — so the index the user aimed
  // at is already the post-removal one, and subtracting again would turn every
  // forward move into a move one slot short (and every drop onto the next
  // neighbour into a no-op).
  return { tierId, index: over };
}
