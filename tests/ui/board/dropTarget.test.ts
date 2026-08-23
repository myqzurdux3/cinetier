import { describe, it, expect } from 'vitest';
import { destinationFor } from '@/ui/board/dropTarget';
import { createBoard, moveFilm, type TierBoard } from '@/domain/tiers';

function board(): TierBoard {
  // S holds [a, b, c]; everything else empty.
  let next = createBoard('b1', 'Mine');
  next = moveFilm(next, 'a', { tierId: 'S', index: 0 });
  next = moveFilm(next, 'b', { tierId: 'S', index: 1 });
  next = moveFilm(next, 'c', { tierId: 'S', index: 2 });
  return next;
}

describe('destinationFor', () => {
  it('drops onto a row by appending to its end', () => {
    expect(destinationFor({ type: 'tier', tierId: 'S' }, board(), 'x')).toEqual({
      tierId: 'S',
      index: 3,
    });
  });

  it('drops onto an empty row at position zero', () => {
    expect(destinationFor({ type: 'tier', tierId: 'A' }, board(), 'x')).toEqual({
      tierId: 'A',
      index: 0,
    });
  });

  it('drops onto a card by taking that card’s position', () => {
    expect(destinationFor({ type: 'card', tierId: 'S', filmId: 'b' }, board(), 'x')).toEqual({
      tierId: 'S',
      index: 1,
    });
  });

  it('drops onto the pool', () => {
    expect(destinationFor({ type: 'pool' }, board(), 'a')).toBe('pool');
  });

  it('returns null when a card is dropped on itself', () => {
    // Not a no-op destination: null means "do not dispatch at all", which is
    // what keeps a stray click from pushing an identical state onto the undo
    // history and making Ctrl+Z appear broken.
    expect(destinationFor({ type: 'card', tierId: 'S', filmId: 'b' }, board(), 'b')).toBeNull();
  });

  it('returns null for a row the board does not have', () => {
    expect(destinationFor({ type: 'tier', tierId: 'nope' }, board(), 'x')).toBeNull();
  });

  it('returns null for a card the board does not place', () => {
    expect(destinationFor({ type: 'card', tierId: 'S', filmId: 'ghost' }, board(), 'x')).toBeNull();
  });

  it('drags a card forward past another in its own row without correcting twice', () => {
    // Moving `a` (index 0) onto `c` (index 2) inside the same row. `moveFilm`
    // removes `a` from the row before inserting it, so index 2 is already a
    // post-removal index: [b, c] with `a` spliced in at 2 gives [b, c, a] —
    // which is what dragging past `c` means, and exactly what
    // @dnd-kit/sortable's own arrayMove(['a','b','c','d'], 0, 2) produces.
    // Subtracting one here would correct for the removal a second time and
    // leave `a` one slot short of where it was dropped.
    expect(destinationFor({ type: 'card', tierId: 'S', filmId: 'c' }, board(), 'a')).toEqual({
      tierId: 'S',
      index: 2,
    });
  });

  it('drags a card onto its immediate neighbour instead of doing nothing', () => {
    // The gesture the double correction turned into a silent no-op — and the
    // one `sortableKeyboardCoordinates` produces for the very first arrow
    // press after a keyboard lift, since it steps one item at a time. `a`
    // onto `b` must swap them: [b, a, c].
    const after = moveFilm(board(), 'a', { tierId: 'S', index: 1 });
    expect(destinationFor({ type: 'card', tierId: 'S', filmId: 'b' }, board(), 'a')).toEqual({
      tierId: 'S',
      index: 1,
    });
    expect(after.placements.S).toEqual(['b', 'a', 'c']);
  });

  it('takes the over card’s index when the drag comes from another row', () => {
    // Nothing leaves this row, so there is no vacated slot to account for
    // either — the same answer as the same-row case above, by a different
    // route through the function.
    let source = board();
    source = moveFilm(source, 'z', { tierId: 'D', index: 0 });
    expect(destinationFor({ type: 'card', tierId: 'S', filmId: 'c' }, source, 'z')).toEqual({
      tierId: 'S',
      index: 2,
    });
  });

  it('appends a card to its own row at the slot its own removal frees', () => {
    // The one place the dragged card's departure still has to be accounted
    // for: dropping onto the row itself means "the end", and once `a` is
    // lifted the row is [b, c] whose end is index 2, not 3.
    expect(destinationFor({ type: 'tier', tierId: 'S' }, board(), 'a')).toEqual({
      tierId: 'S',
      index: 2,
    });
  });

  it('drops onto a pooled card by meaning the pool', () => {
    // BoardCard passes tierId: null while a card is in the pool, so this is
    // the shape a real drop onto a pooled poster produces. Without the null
    // case it falls through to a placements lookup on `null` and the drop is
    // silently ignored.
    expect(destinationFor({ type: 'card', tierId: null, filmId: 'x' }, board(), 'a')).toBe('pool');
  });

  it('drops a pooled card onto a row card at that card’s own index', () => {
    expect(destinationFor({ type: 'card', tierId: 'S', filmId: 'a' }, board(), 'pooled')).toEqual({
      tierId: 'S',
      index: 0,
    });
  });
});
