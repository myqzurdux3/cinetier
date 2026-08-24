import type { CollisionDetection } from '@dnd-kit/core';

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
    const hits = within(args);
    return hits.length > 0 ? hits : fallback(args);
  };
}
