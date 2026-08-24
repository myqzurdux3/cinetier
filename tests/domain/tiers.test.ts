import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIERS,
  createBoard,
  placedIds,
  poolFor,
  moveFilm,
  prefill,
  clearToPool,
  type TierBoard,
} from '@/domain/tiers';
import { makeFilm } from '../support/film';

const heat = makeFilm({ title: 'Heat', rating: 95 });
const dune = makeFilm({ title: 'Dune', rating: 82 });
const solaris = makeFilm({ title: 'Solaris', rating: 64 });
const unrated = makeFilm({ title: 'Unrated', rating: null });
const library = [heat, dune, solaris, unrated];

function board(): TierBoard {
  return createBoard('board-1', 'My ranking');
}

describe('createBoard', () => {
  it('starts with every tier empty', () => {
    const fresh = board();
    expect(fresh.id).toBe('board-1');
    expect(fresh.name).toBe('My ranking');
    expect(fresh.tiers).toEqual(DEFAULT_TIERS);
    for (const tier of DEFAULT_TIERS) {
      expect(fresh.placements[tier.id]).toEqual([]);
    }
  });

  it('names a theme token rather than a colour value', () => {
    // The domain must not contain colour literals; the UI resolves the token.
    // A regression here would put `var(--color-tier-s)` back in domain/, which
    // no lint rule covers because the rule only guards src/ui/**.
    for (const tier of DEFAULT_TIERS) {
      expect(tier.color).toMatch(/^[sabcdf]$/);
    }
  });
});

describe('poolFor', () => {
  it('is the library minus everything placed', () => {
    const placed = moveFilm(board(), heat.id, { tierId: 'S', index: 0 });
    expect(poolFor(placed, library).map((f) => f.id)).toEqual([dune.id, solaris.id, unrated.id]);
  });

  it('gains a film the library gained, with no board change at all', () => {
    // The point of deriving the pool: a re-import reconciles itself.
    const placed = moveFilm(board(), heat.id, { tierId: 'S', index: 0 });
    const arrival = makeFilm({ title: 'Arrival', rating: 88 });
    expect(poolFor(placed, [...library, arrival]).map((f) => f.id)).toContain(arrival.id);
  });

  it('keeps a placement whose film the library no longer has', () => {
    // Skipped when rendering, kept in storage: a later import that restores
    // the film restores its place. Deleting the placement here would make
    // that impossible.
    const placed = moveFilm(board(), heat.id, { tierId: 'S', index: 0 });
    const shrunk = library.filter((f) => f.id !== heat.id);
    expect(poolFor(placed, shrunk).map((f) => f.id)).not.toContain(heat.id);
    expect(placed.placements.S).toEqual([heat.id]);
  });
});

describe('moveFilm', () => {
  it('places a film at an index in a tier', () => {
    let next = moveFilm(board(), heat.id, { tierId: 'S', index: 0 });
    next = moveFilm(next, dune.id, { tierId: 'S', index: 0 });
    expect(next.placements.S).toEqual([dune.id, heat.id]);
  });

  it('moves a film between tiers, leaving no trace in the old one', () => {
    let next = moveFilm(board(), heat.id, { tierId: 'S', index: 0 });
    next = moveFilm(next, heat.id, { tierId: 'B', index: 0 });
    expect(next.placements.S).toEqual([]);
    expect(next.placements.B).toEqual([heat.id]);
  });

  it('returns a film to the pool by removing it from every tier', () => {
    let next = moveFilm(board(), heat.id, { tierId: 'S', index: 0 });
    next = moveFilm(next, heat.id, 'pool');
    expect(placedIds(next).has(heat.id)).toBe(false);
    expect(poolFor(next, library).map((f) => f.id)).toContain(heat.id);
  });

  it('clamps an index past the end rather than leaving a hole', () => {
    let next = moveFilm(board(), heat.id, { tierId: 'S', index: 0 });
    next = moveFilm(next, dune.id, { tierId: 'S', index: 99 });
    expect(next.placements.S).toEqual([heat.id, dune.id]);
  });

  it('ignores a tier that does not exist', () => {
    const next = moveFilm(board(), heat.id, { tierId: 'nope', index: 0 });
    expect(next).toEqual(board());
  });

  it('never mutates the board it was given', () => {
    const original = board();
    moveFilm(original, heat.id, { tierId: 'S', index: 0 });
    expect(original.placements.S).toEqual([]);
  });

  it('hands back the very same board when the film is already there', () => {
    // Reference identity, not deep equality, and that is the whole point: the
    // undo history in App skips recording when the reducer returns the board
    // it was given, so "changed nothing" has to be expressible as `===`.
    // A drag that travels and comes back is the ordinary way to reach this.
    const placed = moveFilm(board(), heat.id, { tierId: 'S', index: 0 });
    expect(moveFilm(placed, heat.id, { tierId: 'S', index: 0 })).toBe(placed);
  });

  it('hands back the very same board when an unplaced film is sent to the pool', () => {
    const start = board();
    expect(moveFilm(start, heat.id, 'pool')).toBe(start);
  });

  it('still returns a new board when the film really moves', () => {
    const placed = moveFilm(board(), heat.id, { tierId: 'S', index: 0 });
    expect(moveFilm(placed, heat.id, { tierId: 'B', index: 0 })).not.toBe(placed);
  });
});

describe('prefill', () => {
  it('places each rated film in the tier its threshold selects', () => {
    // Thresholds: S>=90, A>=80, B>=70, C>=60, D>=50, F everything else.
    // Heat 95 -> S, Dune 82 -> A, Solaris 64 -> C, Unrated -> stays pooled.
    const next = prefill(board(), library);
    expect(next.placements.S).toEqual([heat.id]);
    expect(next.placements.A).toEqual([dune.id]);
    expect(next.placements.C).toEqual([solaris.id]);
    expect(placedIds(next).has(unrated.id)).toBe(false);
  });

  it('orders a tier by rating, highest first', () => {
    const alsoS = makeFilm({ title: 'Also S', rating: 91 });
    const next = prefill(board(), [alsoS, heat]);
    expect(next.placements.S).toEqual([heat.id, alsoS.id]);
  });

  it('only ever moves films that are in the pool', () => {
    // Placing by hand then pre-filling must not rearrange the hand-placed
    // film. Without the pool check, Heat (95) would be yanked from F to S.
    const byHand = moveFilm(board(), heat.id, { tierId: 'F', index: 0 });
    const next = prefill(byHand, library);
    expect(next.placements.F).toEqual([heat.id]);
    expect(next.placements.S).toEqual([]);
  });
});

describe('clearToPool', () => {
  it('empties every tier and keeps the tiers themselves', () => {
    const filled = prefill(board(), library);
    const next = clearToPool(filled);
    expect(next.tiers).toEqual(filled.tiers);
    expect(placedIds(next).size).toBe(0);
    expect(poolFor(next, library)).toHaveLength(library.length);
  });

  it('hands back the very same board when nothing was placed to begin with', () => {
    // The button offering this is always enabled, so pressing it on an empty
    // board is easy to do by accident and must not cost an undo step.
    const empty = board();
    expect(clearToPool(empty)).toBe(empty);
  });
});
