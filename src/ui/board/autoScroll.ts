/**
 * Whether dnd-kit may auto-scroll this container during a drag.
 *
 * Everything may, except the pool's own scroll container.
 *
 * dnd-kit scrolls the scrollable ancestors of the card being dragged, and for
 * a card picked up in the pool that includes the pool's grid. The grid is
 * virtualised, so scrolling it unmounts the rows that leave the viewport —
 * including, when the card came from the far end of a long pool, the card
 * being dragged. Losing that element loses the pointer capture with it, and
 * the drag dies silently: no highlight, no drop, the film back where it
 * started. Measured on a 120-film pool scrolled to its end.
 *
 * Nothing is given up by refusing. Scrolling a drop target only matters when
 * the target has positions to aim at, and the pool has none — it is a set, not
 * an order, so anywhere inside it means the same thing. The page keeps
 * scrolling as before, which is how a row further down is reached mid-drag.
 */
export function mayAutoScroll(element: Element): boolean {
  return element.closest('[data-pool]') === null;
}
