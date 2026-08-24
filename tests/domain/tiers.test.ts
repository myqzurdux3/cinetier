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
  nextBoardName,
  duplicateBoard,
  type Tier,
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

describe('a board whose rows are not the default six', () => {
  // `createBoard` has taken a custom `tiers` array since the board's first
  // commit, and every other test in this file omits it. Everything below
  // operates on `board.tiers` generically; nothing had ever proved it.
  const CUSTOM: Tier[] = [
    { id: 'love', label: 'Loved', color: 'c', minRating: 80 },
    { id: 'rest', label: 'The rest', color: 'f', minRating: null },
  ];
  const films = [
    makeFilm({ id: 'high', rating: 95 }),
    makeFilm({ id: 'low', rating: 10 }),
    makeFilm({ id: 'unrated', rating: null }),
  ];

  it('starts with a slot for each of its own rows and no others', () => {
    const board = createBoard('b1', 'Mine', CUSTOM);
    expect(Object.keys(board.placements).sort()).toEqual(['love', 'rest']);
  });

  it('pre-fills into its own rows, by its own thresholds', () => {
    const filled = prefill(createBoard('b1', 'Mine', CUSTOM), films);

    expect(filled.placements['love']).toEqual(['high']);
    expect(filled.placements['rest']).toEqual(['low']);
    // Unrated films stay in the pool whatever the rows are called: a rating is
    // what pre-fill sorts by.
    expect(Object.values(filled.placements).flat()).not.toContain('unrated');
  });

  it('moves a film between rows it has never heard of before', () => {
    let board = createBoard('b1', 'Mine', CUSTOM);
    board = moveFilm(board, 'high', { tierId: 'rest', index: 0 });
    expect(board.placements['rest']).toEqual(['high']);

    board = moveFilm(board, 'high', { tierId: 'love', index: 0 });
    expect(board.placements['love']).toEqual(['high']);
    expect(board.placements['rest']).toEqual([]);
  });

  it('pools everything its rows do not hold', () => {
    const board = moveFilm(createBoard('b1', 'Mine', CUSTOM), 'high', {
      tierId: 'love',
      index: 0,
    });
    expect(poolFor(board, films).map((f) => f.id)).toEqual(['low', 'unrated']);
  });
});

describe('nextBoardName', () => {
  it('uses the base name when nothing has it', () => {
    expect(nextBoardName([])).toBe('My ranking');
    expect(nextBoardName(['Something else'])).toBe('My ranking');
  });

  it('numbers from two once the base is taken', () => {
    expect(nextBoardName(['My ranking'])).toBe('My ranking 2');
    expect(nextBoardName(['My ranking', 'My ranking 2'])).toBe('My ranking 3');
  });

  it('reuses the first free number rather than counting boards', () => {
    // Deleting "My ranking 2" and adding another should give that name back,
    // not skip to 4 and leave a gap that reads as something gone missing.
    expect(nextBoardName(['My ranking', 'My ranking 3'])).toBe('My ranking 2');
  });

  it('takes a base name of its own', () => {
    expect(nextBoardName(['Horror'], 'Horror')).toBe('Horror 2');
  });
});

describe('duplicateBoard', () => {
  it('carries the tiers and the placements under a new identity', () => {
    const board = moveFilm(createBoard('b1', 'Mine'), 'a', { tierId: 'S', index: 0 });
    const copy = duplicateBoard(board, 'b2', 'Mine 2');

    expect(copy.id).toBe('b2');
    expect(copy.name).toBe('Mine 2');
    expect(copy.placements).toEqual(board.placements);
    expect(copy.tiers).toEqual(board.tiers);
  });

  it('shares no array with the board it copied', () => {
    // Asserted as object identity, not by editing the copy and looking at the
    // original: every operation in this module builds new arrays, so a copy
    // that shared them would still behave correctly today. The point is that
    // the original is on disk and outlives the session — a future in-place
    // edit would reach it, and this is what stops that being possible.
    const board = moveFilm(createBoard('b1', 'Mine'), 'a', { tierId: 'S', index: 0 });
    const copy = duplicateBoard(board, 'b2', 'Copy');

    for (const tier of board.tiers) {
      expect(copy.placements[tier.id]).not.toBe(board.placements[tier.id]);
      expect(copy.placements[tier.id]).toEqual(board.placements[tier.id]);
    }
    expect(copy.placements).not.toBe(board.placements);
  });

  it('shares no tier object with the board it copied', () => {
    const board = createBoard('b1', 'Mine');
    const copy = duplicateBoard(board, 'b2', 'Copy');
    expect(copy.tiers[0]).not.toBe(board.tiers[0]);
  });
});
