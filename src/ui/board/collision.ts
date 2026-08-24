import type { Collision, CollisionDetection } from '@dnd-kit/core';

/**
 * Ask `within` first, and fall back to `fallback` only when it finds nothing.
 *
 * The board needs both. `pointerWithin` answers the question a person is
 * actually asking — which row is under my cursor — and `closestCenter`, used
 * alone, answers a different one: which droppable's centre is nearest. Those
 * agree only while every row is the same height. A row holding forty-eight
 * films is tall, its centre is far from its top edge, and a film dropped
 * squarely inside a short row two rows above lands in the tall one instead,
 * with no highlight anywhere to warn you. Measured, not supposed: dropping a
 * film inside row D sent it to row F.
 *
 * The fallback is not a nicety. `pointerWithin` needs a pointer, and a
 * keyboard drag has none, so it returns nothing for every keyboard move —
 * without a fallback the arrow keys would stop choosing a destination at all.
 * It also covers a pointer in the gap between two rows.
 */
export function preferPointer(
  within: CollisionDetection,
  fallback: CollisionDetection,
): CollisionDetection {
  return (args) => {
    const hits = drawable(within(args));
    return hits.length > 0 ? topmost(hits) : drawable(fallback(args));
  };
}

/**
 * Drop every hit on a card that is sitting in the pool.
 *
 * Two reasons, and the second is a defect rather than a preference.
 *
 * The pool has no order — anywhere inside it means the same thing — so a
 * position within it is not something anyone can aim at, and the pool's own
 * droppable already covers being dropped into.
 *
 * And the pool's grid is virtualised inside a scroll container, which keeps a
 * margin of rows mounted just outside the visible area. A mounted card that
 * has been scrolled out of view still has a layout rectangle, and that
 * rectangle sits wherever the absolute positioning puts it — for a pool
 * scrolled towards its end, on top of the tier rows above it. dnd-kit
 * hit-tests rectangles and knows nothing about clipping, so an invisible card
 * was winning drops aimed at the row behind it and the film went quietly back
 * to the pool. Measured on a 120-film pool scrolled to its last card.
 *
 * They stay registered as droppables, rather than becoming plain draggables,
 * because `sortableKeyboardCoordinates` navigates between sortable items:
 * unregistering them left an arrow key with nowhere to go and stranded every
 * keyboard drag in the pool it started in.
 */
function drawable(hits: Collision[]): Collision[] {
  return hits.filter((hit) => {
    const data = hit.data?.droppableContainer.data.current as
      { type?: string; tierId?: string | null } | undefined;
    return !(data?.type === 'card' && data.tierId === null);
  });
}

/** The droppable id of the pool, shared with the `useDroppable` that claims it. */
export const POOL_ID = 'pool';

/**
 * Collapse a set of pointer hits to the one the person can actually see.
 *
 * `pointerWithin` returns every droppable whose rectangle contains the
 * pointer and orders them by distance to each rectangle's centre. That order
 * is wrong wherever two droppables overlap and one is painted over the other,
 * which is exactly the pool: it is pinned to the bottom of the viewport and
 * sits on top of whatever tier row happens to be behind it. A row holding
 * twenty-four films is tall, its centre is nearer the pointer than the pool's
 * is, and a film dropped squarely inside the visible pool went into that row.
 *
 * Anywhere inside the pool means the pool. There is no position to aim at
 * within it — the pool is a set, not an order — so the pool's own cards being
 * in the list changes nothing, and dropping onto one of them already resolved
 * to the pool.
 */
function topmost(hits: Collision[]): Collision[] {
  const pool = hits.find((hit) => hit.id === POOL_ID);
  return pool ? [pool] : hits;
}
