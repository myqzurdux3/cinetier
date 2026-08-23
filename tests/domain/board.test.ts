import { describe, it, expect } from 'vitest';
import { boardReducer } from '@/domain/board';
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
      expect(boardReducer(board(), action)).toEqual(board());
    }
  });

  it('never mutates the board it was given', () => {
    const original = board();
    boardReducer(original, { type: 'renameTier', tierId: 'S', label: 'Changed' });
    expect(original.tiers.find((t) => t.id === 'S')?.label).toBe('S');
  });
});
