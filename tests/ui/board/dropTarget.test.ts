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

  it('accounts for the dragged card leaving its own row first', () => {
    // Moving `a` (index 0) onto `c` (index 2) inside the same row: once `a`
    // is lifted the row is [b, c] and `c` sits at index 1, so the naive
    // answer of 2 would place `a` after `c` instead of where it was dropped.
    expect(destinationFor({ type: 'card', tierId: 'S', filmId: 'c' }, board(), 'a')).toEqual({
      tierId: 'S',
      index: 1,
    });
  });

  it('does not shift the index when the drag comes from another row', () => {
    let source = board();
    source = moveFilm(source, 'z', { tierId: 'D', index: 0 });
    expect(destinationFor({ type: 'card', tierId: 'S', filmId: 'c' }, source, 'z')).toEqual({
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
