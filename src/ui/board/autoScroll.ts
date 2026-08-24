/**
 * Whether dnd-kit may auto-scroll a container during a drag.
 *
 * Everything may, except the pool's own scroll container.
 *
 * dnd-kit scrolls the scrollable ancestors of the card being dragged, and for
 * a card picked up in the pool that includes the pool's grid. The grid is
 * virtualised, so scrolling it unmounts the rows that leave the viewport —
 * including, when the card came from the far end of a long pool, the card
 * being dragged. Losing that element loses the pointer capture with it, and
 * the drag dies silently: no highlight, no drop, the film back where it
 * started.
 *
 * That was measured, once, on a 120-film pool under the old layout where the
 * pool was pinned across the bottom of the viewport over the rows — the pool's
 * scrollTop moved 372px mid-drag and the drag ended. It has not been
 * reproducible since the pool became a column: not at either breakpoint, not
 * from the far end of a scrolled pool, and not with the pointer held at the
 * grid's edge for two seconds, which is the closest a script gets to a person
 * hesitating. Removing this changes the outcome of no check in e2e/board.mjs.
 *
 * It is kept anyway. The defect was real and the arrangement it needed —
 * the pool under the board, dragged upward through — is still what every
 * screen narrower than the three-column breakpoint uses. The cost is one
 * attribute and this paragraph; the cost of being wrong is a drag that dies
 * without saying anything.
 *
 * Nothing is given up by refusing. Scrolling a drop target only matters when
 * the target has positions to aim at, and the pool has none — it is a set, not
 * an order, so anywhere inside it means the same thing. The page keeps
 * scrolling as before, which is how a row further down is reached mid-drag.
 */
export function mayAutoScroll(element: Element): boolean {
  return element.closest('[data-pool]') === null;
}
