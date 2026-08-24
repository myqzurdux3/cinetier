import { describe, it, expect } from 'vitest';
import { boardReducer, type BoardAction } from '@/domain/board';
import { createBoard, moveFilm, prefill, DEFAULT_TIERS, type TierBoard } from '@/domain/tiers';
import { makeFilm } from '../support/film';

const heat = makeFilm({ title: 'Heat', rating: 95 });
const dune = makeFilm({ title: 'Dune', rating: 82 });
const library = [heat, dune];

function board(): TierBoard {
  return createBoard('board-1', 'My ranking');
}

describe('boardReducer', () => {
  it('delegates a move to the domain operation', () => {
    const next = boardReducer(board(), {
      type: 'move',
      filmId: heat.id,
      to: { tierId: 'S', index: 0 },
    });
    expect(next).toEqual(moveFilm(board(), heat.id, { tierId: 'S', index: 0 }));
  });

  it('delegates a prefill to the domain operation', () => {
    const next = boardReducer(board(), { type: 'prefill', films: library });
    expect(next).toEqual(prefill(board(), library));
  });

  it('renames a tier without touching its films', () => {
    const placed = boardReducer(board(), {
      type: 'move',
      filmId: heat.id,
      to: { tierId: 'S', index: 0 },
    });
    const next = boardReducer(placed, { type: 'renameTier', tierId: 'S', label: 'Godlike' });
    expect(next.tiers.find((t) => t.id === 'S')?.label).toBe('Godlike');
    expect(next.placements.S).toEqual([heat.id]);
  });

  it('recolours a tier', () => {
    const next = boardReducer(board(), { type: 'recolorTier', tierId: 'S', color: 'c' });
    expect(next.tiers.find((t) => t.id === 'S')?.color).toBe('c');
  });

  it('sets a threshold', () => {
    const next = boardReducer(board(), { type: 'setThreshold', tierId: 'S', minRating: 97 });
    expect(next.tiers.find((t) => t.id === 'S')?.minRating).toBe(97);
  });

  it('adds a tier after another, with an id nothing else uses', () => {
    const next = boardReducer(board(), { type: 'addTier', afterTierId: 'S' });
    expect(next.tiers).toHaveLength(DEFAULT_TIERS.length + 1);
    expect(next.tiers[1]?.id).not.toBe('S');
    const ids = next.tiers.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The new row must be placeable immediately, which means it needs its own
    // (empty) placements entry rather than an absent one.
    expect(next.placements[next.tiers[1]!.id]).toEqual([]);
  });

  it('removes a tier by returning its films to the pool, not by losing them', () => {
    const placed = boardReducer(board(), {
      type: 'move',
      filmId: heat.id,
      to: { tierId: 'S', index: 0 },
    });
    const next = boardReducer(placed, { type: 'removeTier', tierId: 'S' });
    expect(next.tiers.some((t) => t.id === 'S')).toBe(false);
    expect(Object.values(next.placements).flat()).not.toContain(heat.id);
    // And the film really is poolable again, not merely absent from placements.
    expect(Object.hasOwn(next.placements, 'S')).toBe(false);
  });

  it('refuses to remove the last remaining tier', () => {
    // A board with no rows has nowhere to drop anything and no way back.
    let next = board();
    for (const tier of DEFAULT_TIERS.slice(0, -1)) {
      next = boardReducer(next, { type: 'removeTier', tierId: tier.id });
    }
    expect(next.tiers).toHaveLength(1);
    const after = boardReducer(next, { type: 'removeTier', tierId: next.tiers[0]!.id });
    expect(after.tiers).toHaveLength(1);
  });

  it('reorders a tier', () => {
    const next = boardReducer(board(), { type: 'moveTier', tierId: 'F', toIndex: 0 });
    expect(next.tiers.map((t) => t.id)).toEqual(['F', 'S', 'A', 'B', 'C', 'D']);
  });

  it('renames the board', () => {
    const next = boardReducer(board(), { type: 'renameBoard', name: 'Best of 1999' });
    expect(next.name).toBe('Best of 1999');
  });

  it('ignores an action naming a tier that does not exist', () => {
    for (const action of [
      { type: 'renameTier', tierId: 'nope', label: 'x' },
      { type: 'recolorTier', tierId: 'nope', color: 'a' },
      { type: 'setThreshold', tierId: 'nope', minRating: 10 },
      { type: 'removeTier', tierId: 'nope' },
      { type: 'moveTier', tierId: 'nope', toIndex: 0 },
    ] as const) {
      // toBe, not toEqual, against the very same input reference (not a fresh
      // board() call): these branches deliberately hand back the board they
      // were given (see the "hands back the very same board" test below) so
      // that App's undo history can skip recording a no-op edit. toEqual
      // would pass just as happily against `return { ...board }` —
      // value-equal, reference-distinct — which would silently push an
      // identical board onto the undo stack.
      const input = board();
      expect(boardReducer(input, action)).toBe(input);
    }
  });

  it('hands back the very same board for an edit that changes nothing', () => {
    // Reference identity is the contract App's undo history relies on: its
    // guard compares `next === current.present`, so a branch that produces an
    // equal-but-new board would push an identical state and leave the next
    // Ctrl+Z looking broken. One case per branch that can no-op without an
    // unknown id.
    const start = boardReducer(board(), { type: 'renameTier', tierId: 'S', label: 'Top' });
    const unchanging: BoardAction[] = [
      { type: 'renameTier', tierId: 'S', label: 'Top' },
      { type: 'recolorTier', tierId: 'S', color: 's' },
      { type: 'setThreshold', tierId: 'S', minRating: 90 },
      { type: 'moveTier', tierId: 'S', toIndex: 0 },
      // Clamped back onto its own index: what the first row's "up" button
      // would send if it were not disabled.
      { type: 'moveTier', tierId: 'S', toIndex: -3 },
      { type: 'renameBoard', name: start.name },
      { type: 'clearToPool' },
      { type: 'move', filmId: heat.id, to: 'pool' },
      { type: 'prefill', films: [] },
    ];
    for (const action of unchanging) {
      expect(boardReducer(start, action)).toBe(start);
    }
  });

  it('still returns a new board for each of those edits when it does change something', () => {
    const start = boardReducer(board(), { type: 'renameTier', tierId: 'S', label: 'Top' });
    const changing: BoardAction[] = [
      { type: 'renameTier', tierId: 'S', label: 'Tops' },
      { type: 'recolorTier', tierId: 'S', color: 'f' },
      { type: 'setThreshold', tierId: 'S', minRating: 91 },
      { type: 'moveTier', tierId: 'S', toIndex: 1 },
      { type: 'renameBoard', name: 'Something else' },
      { type: 'move', filmId: heat.id, to: { tierId: 'S', index: 0 } },
      { type: 'prefill', films: library },
    ];
    for (const action of changing) {
      expect(boardReducer(start, action)).not.toBe(start);
    }
  });

  it('never mutates the board it was given', () => {
    const original = board();
    boardReducer(original, { type: 'renameTier', tierId: 'S', label: 'Changed' });
    expect(original.tiers.find((t) => t.id === 'S')?.label).toBe('S');
  });
});
