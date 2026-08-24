# Tier board (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tier board the app is named after — rows of ranked films, drag and drop with full keyboard operation, undo, pre-filling from imported ratings, and a pool built from the filtered library — persisted so it survives a visit.

**Architecture:** The board is a plain data structure (`TierBoard`) mutated only by a pure reducer in `domain/`, wrapped by an undo history in `App`, and rendered by a `dnd-kit` context that spans both the board and the pool. The pool is derived from the library minus everything placed, never stored, so a re-import reconciles itself. Persistence follows the same shape as the filter criteria: a service module over one IndexedDB store, written debounced.

**Tech Stack:** React 19, TypeScript 6 strict with `noUncheckedIndexedAccess`, Vite 8, Tailwind CSS v4, Vitest 4 (projects `core`/node and `ui`/jsdom), `@dnd-kit/core` + `@dnd-kit/sortable`, `@tanstack/react-virtual` (already present), `idb` (already present).

**Spec:** `docs/superpowers/specs/2026-08-23-cinetier-tier-board-design.md`

## Global Constraints

- **Layering, ESLint-enforced.** `parsers/` and `domain/` are pure: no `fetch`, `window`, `document`, `localStorage`, `sessionStorage`, `indexedDB`, `navigator`, `XMLHttpRequest`, `process`, or dynamic `import()`. `services/` is the only I/O boundary. `enrich/` sits above `services/`. `ui/` sits on top.
- **No colour literal anywhere in `src/ui/**`** except `src/ui/logoMark.ts`. Colours come from the Tailwind v4 `@theme` tokens declared in `src/index.css`. The tier tokens are `--color-tier-s` through `--color-tier-f`, redefined under `[data-theme='neon']`.
- **TypeScript strict with `noUncheckedIndexedAccess`.** Indexing an array or a `Record` yields `T | undefined`; the plan's code handles that explicitly rather than asserting it away, except where a preceding check makes the assertion provable.
- **The only outbound hosts are `api.themoviedb.org` and `image.tmdb.org`.** Fonts stay self-hosted. The README promises both. This plan adds no network calls at all.
- **The TMDB key ships in the client bundle by design** and is documented as such. It is not a leak; do not "fix" it.
- **Never stage or commit `.env` or `.env.local`.**
- **commitlint `scope-enum`** is exactly `domain`, `parsers`, `services`, `ui`, `deps`, `ci`, `docs`. There is no `board` or `enrich` scope; use the layer the change lives in.
- **The suite pins `TZ: 'America/New_York'`** in `vite.config.ts`'s `test` block, deliberately, so date assertions can discriminate local-midnight parsing from UTC-midnight parsing. Do not change it.
- **Vitest's `toEqual` and `expect.objectContaining` treat an `undefined`-valued property as absent.** An assertion that must prove a key is *gone* uses `Object.hasOwn`.
- **A test that cannot fail is a defect.** The previous plan on this codebase produced eight of them. Every task below names the mutation its tests must catch; the implementer runs that mutation, confirms the named test goes red with the actual failure line, and reverts.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/domain/tiers.ts` *(modify)* | The board's shape and the pure operations over it: `Tier`, `TierColor`, `TierBoard`, `createBoard`, `poolFor`, `moveFilm`, `prefill`, `clearToPool`, and the tier-row edits |
| `src/domain/board.ts` *(create)* | `BoardAction` and `boardReducer` — one entry point that maps an action onto the operations in `tiers.ts` |
| `src/domain/history.ts` *(create)* | `History<T>`, `initHistory`, `record`, `undo`, `redo` — undo as a generic, testable structure with no knowledge of boards |
| `src/services/db.ts` *(modify)* | Schema version 3, adding the `boards` store |
| `src/services/boards.ts` *(create)* | `saveBoard`, `loadBoard`, `clearBoards` over that store |
| `src/ui/board/BoardCard.tsx` *(create)* | One draggable poster, used identically in a tier row and in the pool |
| `src/ui/board/TierRow.tsx` *(create)* | One row: its label, its colour, its droppable area, and its ordered cards |
| `src/ui/board/Pool.tsx` *(create)* | The pool: the existing `FilmGrid` as a drop target, plus a title search |
| `src/ui/board/BoardScreen.tsx` *(create)* | The `DndContext` spanning board and pool: sensors, keyboard operation, screen-reader announcements, and the drop-to-action translation |
| `src/ui/board/PrefillPanel.tsx` *(create)* | The thresholds, the count each would place, and the action that applies them |
| `src/ui/board/TierRowControls.tsx` *(create)* | Rename, recolour, add, remove and reorder a row |
| `src/ui/App.tsx` *(modify)* | Holds the board through `useReducer` + history, persists it, and renders `BoardScreen` where the grid used to be |
| `tests/domain/tiers.test.ts` *(rewrite)* | The existing file, rewritten for the reshaped module — it is the only consumer of `tiers.ts` in the repo |

**A fact that shapes this plan:** `src/domain/tiers.ts` already exists, written and tested, and `tests/domain/tiers.test.ts` is its **only** consumer anywhere in `src/` or `tests/`. Reshaping it therefore breaks nothing but its own tests. Verify this before starting Task 1 with `grep -rn "domain/tiers" src/ tests/` — if anything else has come to import it, stop and report rather than adapting on the fly.

---

### Task 1: Reshape the board's data structure

**Files:**

- Modify: `src/domain/tiers.ts` (whole file)
- Test: `tests/domain/tiers.test.ts` (rewrite)

**Interfaces:**

- Consumes: `Film` from `@/domain/film`.
- Produces: `TIER_COLORS`, `TierColor`, `Tier`, `DEFAULT_TIERS`, `TierBoard`, `createBoard(id, name, tiers?)`, `placedIds(board)`, `poolFor(board, films)`, `moveFilm(board, filmId, to)`, `prefill(board, films)`, `clearToPool(board)`. Task 2's reducer calls every one of these; Tasks 6-11 read the types.

**Why this task exists.** Three changes, each with a reason:

1. `TierBoard` gains `id` and `name`. Plan A shows one board, but adding an identity to a record *after* it has been persisted means migrating every record written without one.
2. `TierBoard` loses `pool`. Today `placements` and `pool` are two sources of truth for one fact — a film is unplaced exactly when no tier holds it. Derived, a re-import that adds films makes them appear in the pool with no code, and one that removes a film leaves its placement intact so a later import restores its place.
3. `Tier.color` becomes a token *name* (`'s'`) rather than a CSS value (`'var(--color-tier-s)'`). The domain must not contain colour values, and the UI resolving a name is what keeps `src/ui/**` free of literals while still letting a row be recoloured.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `tests/domain/tiers.test.ts` with:

```ts
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

  it("returns a film to the pool by removing it from every tier", () => {
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/tiers.test.ts`
Expected: FAIL — `createBoard`, `placedIds`, `poolFor`, `prefill` and `clearToPool` are not exported, and `moveFilm`'s third argument has the old shape.

- [ ] **Step 3: Rewrite the module**

Replace the entire contents of `src/domain/tiers.ts` with:

```ts
import type { Film } from './film';

/**
 * The theme's tier tokens, by name. The domain names the token; the UI turns
 * `'s'` into `var(--color-tier-s)`. Keeping the value out of here is what lets
 * a row be recoloured without putting a colour literal in either layer.
 */
export const TIER_COLORS = ['s', 'a', 'b', 'c', 'd', 'f'] as const;
export type TierColor = (typeof TIER_COLORS)[number];

export interface Tier {
  id: string;
  label: string;
  color: TierColor;
  /** Lowest normalized rating that lands in this tier; null means "everything remaining". */
  minRating: number | null;
}

export const DEFAULT_TIERS: Tier[] = [
  { id: 'S', label: 'S', color: 's', minRating: 90 },
  { id: 'A', label: 'A', color: 'a', minRating: 80 },
  { id: 'B', label: 'B', color: 'b', minRating: 70 },
  { id: 'C', label: 'C', color: 'c', minRating: 60 },
  { id: 'D', label: 'D', color: 'd', minRating: 50 },
  { id: 'F', label: 'F', color: 'f', minRating: null },
];

export interface TierBoard {
  id: string;
  name: string;
  tiers: Tier[];
  /**
   * Tier id -> ordered film ids. A film the library holds and no tier lists is
   * in the pool; the pool is never stored, because storing it would be a second
   * source of truth for that one fact.
   */
  placements: Record<string, string[]>;
}

/** Where a film is going: a position in a tier, or back to the pool. */
export type Destination = { tierId: string; index: number } | 'pool';

function emptyPlacements(tiers: Tier[]): Record<string, string[]> {
  return Object.fromEntries(tiers.map((tier) => [tier.id, []]));
}

export function createBoard(id: string, name: string, tiers: Tier[] = DEFAULT_TIERS): TierBoard {
  return { id, name, tiers, placements: emptyPlacements(tiers) };
}

/** Every film id the board has placed somewhere. */
export function placedIds(board: TierBoard): Set<string> {
  return new Set(Object.values(board.placements).flat());
}

/**
 * The pool: the library minus everything placed, in the library's own order.
 *
 * A placement naming a film the library no longer holds simply contributes
 * nothing here — it is not an error and it is not cleaned up, so re-importing
 * that film later puts it back where it was.
 */
export function poolFor(board: TierBoard, films: Film[]): Film[] {
  const placed = placedIds(board);
  return films.filter((film) => !placed.has(film.id));
}

/**
 * Move a film to a destination. Returns a new board; the input is untouched.
 *
 * Deliberately does not check that the film exists: once the pool is derived,
 * the board holds no library to check against, and a placement pointing at a
 * film nobody has is already a state this design supports (see poolFor).
 */
export function moveFilm(board: TierBoard, filmId: string, to: Destination): TierBoard {
  if (to !== 'pool' && !board.tiers.some((tier) => tier.id === to.tierId)) return board;

  const placements: Record<string, string[]> = Object.fromEntries(
    Object.entries(board.placements).map(([id, ids]) => [id, ids.filter((f) => f !== filmId)]),
  );

  if (to !== 'pool') {
    const target = placements[to.tierId] ?? [];
    target.splice(Math.max(0, Math.min(to.index, target.length)), 0, filmId);
    placements[to.tierId] = target;
  }

  return { ...board, placements };
}

function tierForRating(rating: number, tiers: Tier[]): Tier | undefined {
  return tiers.find((tier) => tier.minRating === null || rating >= tier.minRating);
}

/**
 * Fill the tiers from the pool, using each tier's threshold.
 *
 * Only pooled films move: a film already placed by hand keeps its row, because
 * pre-filling is an aid to a ranking in progress, not a reset of one. Unrated
 * films stay pooled, since a rating is what this sorts by.
 */
export function prefill(board: TierBoard, films: Film[]): TierBoard {
  const pooled = poolFor(board, films)
    .filter((film): film is Film & { rating: number } => film.rating !== null)
    .sort((a, b) => b.rating - a.rating);

  let next = board;
  for (const film of pooled) {
    const tier = tierForRating(film.rating, next.tiers);
    if (!tier) continue;
    const length = next.placements[tier.id]?.length ?? 0;
    next = moveFilm(next, film.id, { tierId: tier.id, index: length });
  }
  return next;
}

/** Send everything back to the pool, keeping the rows themselves. */
export function clearToPool(board: TierBoard): TierBoard {
  return { ...board, placements: emptyPlacements(board.tiers) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/tiers.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Mutation-check the two tests that carry this task**

The named mutations, run one at a time and reverted after each:

1. In `prefill`, replace `poolFor(board, films)` with `films`. Expected: **"only ever moves films that are in the pool"** goes red — `next.placements.F` is `[]` and `S` is `[heat.id]`.
2. In `poolFor`, add `delete board.placements[...]` cleanup for missing films — or more simply, make it return `films` unfiltered. Expected: **"is the library minus everything placed"** goes red.

Record the actual failure line for each in the report. A mutation that leaves the suite green means the test is not carrying its weight and must be strengthened before moving on.

- [ ] **Step 6: Run the full suite, typecheck and lint**

Run: `npm run test:run && npm run typecheck && npm run lint`
Expected: all green. Nothing outside `tests/domain/tiers.test.ts` imports this module, so nothing else should move.

- [ ] **Step 7: Commit**

```bash
git add src/domain/tiers.ts tests/domain/tiers.test.ts
git commit -m "feat(domain): give a board an identity and derive its pool"
```

---

### Task 2: The board reducer

**Files:**

- Create: `src/domain/board.ts`
- Test: `tests/domain/board.test.ts`

**Interfaces:**

- Consumes: everything Task 1 produced.
- Produces: `BoardAction`, `boardReducer(board, action)`. Task 11 passes this to `useReducer`; Tasks 8-10 dispatch its actions.

**Why a reducer rather than functions called from components.** Ranking is hundreds of small mutations and some of them are mistakes. A single entry point taking a described action is what makes the undo history in Task 3 possible at all — snapshotting after every call to one function is trivial; snapshotting after calls scattered across six components is not.

- [ ] **Step 1: Write the failing tests**

Create `tests/domain/board.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/board.test.ts`
Expected: FAIL — `Failed to resolve import "@/domain/board"`.

- [ ] **Step 3: Write the reducer**

Create `src/domain/board.ts`:

```ts
import type { Film } from './film';
import {
  clearToPool,
  moveFilm,
  prefill,
  type Destination,
  type TierBoard,
  type TierColor,
} from './tiers';

export type BoardAction =
  | { type: 'move'; filmId: string; to: Destination }
  | { type: 'prefill'; films: Film[] }
  | { type: 'clearToPool' }
  | { type: 'addTier'; afterTierId: string | null }
  | { type: 'removeTier'; tierId: string }
  | { type: 'moveTier'; tierId: string; toIndex: number }
  | { type: 'renameTier'; tierId: string; label: string }
  | { type: 'recolorTier'; tierId: string; color: TierColor }
  | { type: 'setThreshold'; tierId: string; minRating: number | null }
  | { type: 'renameBoard'; name: string };

/** An id no current row is using. Ids are internal; the label is what users see. */
function freshTierId(board: TierBoard): string {
  const taken = new Set(board.tiers.map((tier) => tier.id));
  let n = board.tiers.length + 1;
  while (taken.has(`tier-${String(n)}`)) n += 1;
  return `tier-${String(n)}`;
}

function withTier(
  board: TierBoard,
  tierId: string,
  change: (tier: TierBoard['tiers'][number]) => TierBoard['tiers'][number],
): TierBoard {
  if (!board.tiers.some((tier) => tier.id === tierId)) return board;
  return { ...board, tiers: board.tiers.map((tier) => (tier.id === tierId ? change(tier) : tier)) };
}

export function boardReducer(board: TierBoard, action: BoardAction): TierBoard {
  switch (action.type) {
    case 'move':
      return moveFilm(board, action.filmId, action.to);

    case 'prefill':
      return prefill(board, action.films);

    case 'clearToPool':
      return clearToPool(board);

    case 'addTier': {
      const id = freshTierId(board);
      const at = board.tiers.findIndex((tier) => tier.id === action.afterTierId);
      const index = at === -1 ? board.tiers.length : at + 1;
      const tiers = [...board.tiers];
      tiers.splice(index, 0, { id, label: 'New', color: 'f', minRating: null });
      // A row with no placements entry cannot be dropped into, so it is created
      // alongside the row rather than lazily on first drop.
      return { ...board, tiers, placements: { ...board.placements, [id]: [] } };
    }

    case 'removeTier': {
      if (!board.tiers.some((tier) => tier.id === action.tierId)) return board;
      // A board with no rows has nowhere to drop anything and no way back.
      if (board.tiers.length === 1) return board;
      const tiers = board.tiers.filter((tier) => tier.id !== action.tierId);
      const placements = { ...board.placements };
      // Dropping the entry is what returns its films to the pool, since the
      // pool is everything the library holds and no tier lists.
      delete placements[action.tierId];
      return { ...board, tiers, placements };
    }

    case 'moveTier': {
      const from = board.tiers.findIndex((tier) => tier.id === action.tierId);
      if (from === -1) return board;
      const tiers = [...board.tiers];
      const [moved] = tiers.splice(from, 1);
      if (!moved) return board;
      tiers.splice(Math.max(0, Math.min(action.toIndex, tiers.length)), 0, moved);
      return { ...board, tiers };
    }

    case 'renameTier':
      return withTier(board, action.tierId, (tier) => ({ ...tier, label: action.label }));

    case 'recolorTier':
      return withTier(board, action.tierId, (tier) => ({ ...tier, color: action.color }));

    case 'setThreshold':
      return withTier(board, action.tierId, (tier) => ({ ...tier, minRating: action.minRating }));

    case 'renameBoard':
      return { ...board, name: action.name };
  }
}
```

**No `default` case, deliberately.** `BoardAction` is a discriminated union and every arm returns, so adding a variant without handling it fails the build with a missing-return error rather than silently falling through to "return the board unchanged" — which is the failure mode a `default` would hide.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/board.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Mutation-check**

1. In `removeTier`, replace the `delete placements[action.tierId]` with leaving the entry in place. Expected: **"removes a tier by returning its films to the pool, not by losing them"** goes red on the `Object.hasOwn` assertion.
2. Remove the `board.tiers.length === 1` guard. Expected: **"refuses to remove the last remaining tier"** goes red.

Record both failure lines.

- [ ] **Step 6: Full suite, typecheck, lint**

Run: `npm run test:run && npm run typecheck && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/domain/board.ts tests/domain/board.test.ts
git commit -m "feat(domain): describe every board edit as an action"
```

---

### Task 3: Undo and redo

**Files:**

- Create: `src/domain/history.ts`
- Test: `tests/domain/history.test.ts`

**Interfaces:**

- Consumes: nothing — this module is generic over `T` and knows nothing about boards.
- Produces: `History<T>`, `HISTORY_LIMIT`, `initHistory(present)`, `record(history, next)`, `undo(history)`, `redo(history)`, `canUndo(history)`, `canRedo(history)`. Task 11 wires these around `boardReducer`.

**Why whole snapshots rather than inverse actions.** A `TierBoard` is a small object of string arrays; copying one is cheap. Inverse actions are where undo implementations go wrong — every action needs a correct inverse, and `removeTier`'s inverse has to restore both the row and its position. Snapshots have one implementation and no per-action correctness argument.

- [ ] **Step 1: Write the failing tests**

Create `tests/domain/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  initHistory,
  record,
  undo,
  redo,
  canUndo,
  canRedo,
  HISTORY_LIMIT,
} from '@/domain/history';

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const history = initHistory('a');
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('undo returns the previous state and redo returns the undone one', () => {
    let history = record(initHistory('a'), 'b');
    history = record(history, 'c');

    history = undo(history);
    expect(history.present).toBe('b');
    history = undo(history);
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);

    history = redo(history);
    expect(history.present).toBe('b');
    history = redo(history);
    expect(history.present).toBe('c');
    expect(canRedo(history)).toBe(false);
  });

  it('discards the future when a new state is recorded after an undo', () => {
    // Branching histories are the other way to do this, and they surprise
    // people: redo after an unrelated edit restores something they did not
    // expect. Discarding is what every editor does.
    let history = record(record(initHistory('a'), 'b'), 'c');
    history = undo(history);
    expect(canRedo(history)).toBe(true);

    history = record(history, 'd');
    expect(canRedo(history)).toBe(false);
    expect(history.present).toBe('d');
    expect(undo(history).present).toBe('b');
  });

  it('undo at the beginning and redo at the end are no-ops', () => {
    const history = initHistory('a');
    expect(undo(history)).toEqual(history);
    expect(redo(history)).toEqual(history);
  });

  it('forgets the oldest state past the limit', () => {
    let history = initHistory(0);
    for (let n = 1; n <= HISTORY_LIMIT + 5; n += 1) history = record(history, n);

    expect(history.past).toHaveLength(HISTORY_LIMIT);
    // The oldest survivor is the (limit)th-from-last, not the original 0.
    expect(history.past[0]).toBe(HISTORY_LIMIT + 5 - HISTORY_LIMIT);
  });

  it('never mutates the history it was given', () => {
    const history = record(initHistory('a'), 'b');
    const before = { past: [...history.past], present: history.present, future: [...history.future] };
    undo(history);
    record(history, 'c');
    expect(history).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/history.test.ts`
Expected: FAIL — `Failed to resolve import "@/domain/history"`.

- [ ] **Step 3: Write the module**

Create `src/domain/history.ts`:

```ts
/**
 * Undo as a generic structure: a stack behind the present and a stack ahead of
 * it. Deliberately knows nothing about what it holds, so it can be tested by
 * pushing strings around rather than by building boards.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * How many states back undo reaches. Fifty is far more than a session's worth
 * of mistakes and small enough that the whole history is a few kilobytes of
 * string arrays.
 */
export const HISTORY_LIMIT = 50;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Record a new present. The future is discarded rather than branched: redo
 * after an unrelated edit would otherwise restore something the user has no
 * reason to expect, which is the behaviour every editor avoids.
 */
export function record<T>(history: History<T>, next: T): History<T> {
  const past = [...history.past, history.present];
  return {
    past: past.slice(Math.max(0, past.length - HISTORY_LIMIT)),
    present: next,
    future: [],
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/history.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Mutation-check**

1. In `record`, replace `future: []` with `future: history.future`. Expected: **"discards the future when a new state is recorded after an undo"** goes red.
2. In `record`, remove the `.slice(...)` cap. Expected: **"forgets the oldest state past the limit"** goes red.

- [ ] **Step 6: Full suite, typecheck, lint**

Run: `npm run test:run && npm run typecheck && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/domain/history.ts tests/domain/history.test.ts
git commit -m "feat(domain): add an undo history independent of what it holds"
```

---

### Task 4: Persist a board

**Files:**

- Modify: `src/services/db.ts`
- Create: `src/services/boards.ts`
- Test: `tests/services/boards.test.ts`

**Interfaces:**

- Consumes: `TierBoard` from `@/domain/tiers`, `db` from `./db`.
- Produces: `saveBoard(board)`, `loadBoard(id)`, `loadFirstBoard()`, `clearBoards()`. Task 11 calls all four.

**Why version 3 rather than reusing an existing store.** The `boards` store is keyed by board id and will hold many records once Plan B lands; the `library` and `filters` stores hold exactly one record each under the key `'current'`. Mixing them would mean one store with two record shapes.

- [ ] **Step 1: Write the failing tests**

Create `tests/services/boards.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from 'idb';
import { saveBoard, loadBoard, loadFirstBoard, clearBoards } from '@/services/boards';
import { db, resetDatabase } from '@/services/db';
import { createBoard, moveFilm } from '@/domain/tiers';

beforeEach(async () => {
  await resetDatabase();
});

describe('board persistence', () => {
  it('round-trips a board', async () => {
    const board = moveFilm(createBoard('b1', 'Mine'), 'film-1', { tierId: 'S', index: 0 });
    await saveBoard(board);
    expect(await loadBoard('b1')).toEqual(board);
  });

  it('returns null for a board that was never saved', async () => {
    expect(await loadBoard('nope')).toBeNull();
  });

  it('overwrites a board saved under the same id', async () => {
    await saveBoard(createBoard('b1', 'First'));
    await saveBoard(createBoard('b1', 'Second'));
    expect((await loadBoard('b1'))?.name).toBe('Second');
    expect(await (await db()).count('boards')).toBe(1);
  });

  it('loadFirstBoard returns null when there are none', async () => {
    expect(await loadFirstBoard()).toBeNull();
  });

  it('loadFirstBoard returns the only board there is', async () => {
    await saveBoard(createBoard('b1', 'Mine'));
    expect((await loadFirstBoard())?.id).toBe('b1');
  });

  it('clearBoards removes every board', async () => {
    await saveBoard(createBoard('b1', 'One'));
    await saveBoard(createBoard('b2', 'Two'));
    await clearBoards();
    expect(await loadFirstBoard()).toBeNull();
  });
});

describe('the v2 to v3 schema upgrade', () => {
  it('keeps an existing library and filters intact when boards is added', async () => {
    // fake-indexeddb is fresh every run, so an upgrade is never exercised
    // unless a test builds the older database by hand first. This is the
    // second bump; the first (v1 to v2) is covered in library.test.ts.
    const v2 = await openDB('cinetier', 2, {
      upgrade(database) {
        for (const store of ['tmdb', 'tmdbDetails', 'library', 'filters']) {
          if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
        }
      },
    });
    const saved = { films: [], savedAt: 1_700_000_000_000 };
    try {
      await v2.put('library', saved, 'current');
      await v2.put('filters', { criteria: { minRating: 80 }, savedAt: 1 }, 'current');
    } finally {
      // Without this, a failed put leaves the connection open and the next
      // beforeEach's deleteDB blocks — the suite hangs instead of going red.
      v2.close();
    }

    const upgraded = await db();

    expect(upgraded.version).toBe(3);
    expect(Array.from(upgraded.objectStoreNames).sort()).toEqual([
      'boards',
      'filters',
      'library',
      'tmdb',
      'tmdbDetails',
    ]);
    expect(await upgraded.get('library', 'current')).toEqual(saved);
    expect((await upgraded.get('filters', 'current'))?.criteria).toEqual({ minRating: 80 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/services/boards.test.ts`
Expected: FAIL — `Failed to resolve import "@/services/boards"`.

- [ ] **Step 3: Add the store**

In `src/services/db.ts`, add the `boards` entry to `CinetierDB` after `filters`:

```ts
  boards: {
    key: string;
    value: TierBoard;
  };
```

Add its import at the top:

```ts
import type { TierBoard } from '@/domain/tiers';
```

Then change the two constants:

```ts
const VERSION = 3;

const STORES = ['tmdb', 'tmdbDetails', 'library', 'filters', 'boards'] as const;
```

Nothing else in the file changes. The upgrade callback creates whatever is missing and does not branch on the arriving version, which is exactly why this bump needs no new upgrade code — that property was the reason it was written that way, and this is the first time it pays off.

- [ ] **Step 4: Write the service**

Create `src/services/boards.ts`:

```ts
import { db } from './db';
import type { TierBoard } from '@/domain/tiers';

export async function saveBoard(board: TierBoard): Promise<void> {
  await (await db()).put('boards', board, board.id);
}

export async function loadBoard(id: string): Promise<TierBoard | null> {
  return (await (await db()).get('boards', id)) ?? null;
}

/**
 * The board to show when nothing says which one. Plan A never creates a second
 * board, so this is simply "the board" until named boards arrive and replace
 * this with a remembered id.
 */
export async function loadFirstBoard(): Promise<TierBoard | null> {
  const all = await (await db()).getAll('boards');
  return all[0] ?? null;
}

export async function clearBoards(): Promise<void> {
  await (await db()).clear('boards');
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/services/boards.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Mutation-check the upgrade test**

Change the upgrade loop in `src/services/db.ts` to delete and recreate each store:

```ts
for (const store of STORES) {
  if (database.objectStoreNames.contains(store)) database.deleteObjectStore(store);
  database.createObjectStore(store);
}
```

Expected: **"keeps an existing library and filters intact when boards is added"** goes red on the `expect(await upgraded.get('library', 'current')).toEqual(saved)` assertion, with the received value `undefined`. Revert.

This is the assertion that matters: a store-names check alone proves nothing about contents.

- [ ] **Step 7: Full suite, typecheck, lint**

Run: `npm run test:run && npm run typecheck && npm run lint`
Expected: green. Watch for the existing `tests/services/library.test.ts` v1-to-v2 upgrade test, which asserts `version` is `2` — **it will now fail**, because `db()` opens at 3. Update that one assertion to `3` and its surrounding store-list assertion to include `boards`; its comment already says the pin exists so that a bump has to confront it, and this is that moment. Do not loosen the assertion to `toBeGreaterThan`.

- [ ] **Step 8: Commit**

```bash
git add src/services/db.ts src/services/boards.ts tests/services/boards.test.ts tests/services/library.test.ts
git commit -m "feat(services): persist a tier board at schema version 3"
```

---

### Task 5: The drag vocabulary, as a pure function

**Files:**

- Modify: `package.json` (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Create: `src/ui/board/dropTarget.ts`
- Test: `tests/ui/board/dropTarget.test.ts`

**Interfaces:**

- Consumes: `TierBoard`, `Destination` from `@/domain/tiers`.
- Produces: `DropTarget`, `destinationFor(target, board, draggedId)`. Task 8's `onDragEnd` is a two-line function on top of this.

**Why this is its own task, and its own module.** Everything hard about drag and drop that is *not* the browser lives in one question: given what the pointer ended over, where does the film go? Answering that inside a `DndContext` callback would bury it in a component that jsdom can barely exercise. Answered here it is a pure function over plain data, testable exhaustively in milliseconds, and Task 8's callback becomes a translation of dnd-kit's objects into these ones.

- [ ] **Step 1: Add the dependencies**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Then verify the install did not warn about peer dependencies against React 19:

```bash
npm ls @dnd-kit/core @dnd-kit/sortable react
```

**If npm reports a peer-dependency conflict with React 19, stop and report it rather than passing `--legacy-peer-deps`.** The whole reason the spec chose this library is its keyboard support; if it cannot sit on this React version cleanly, that is a decision for the controller, not a flag to silence.

- [ ] **Step 2: Write the failing tests**

Create `tests/ui/board/dropTarget.test.ts`:

```ts
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
    expect(
      destinationFor({ type: 'card', tierId: 'S', filmId: 'b' }, board(), 'x'),
    ).toEqual({ tierId: 'S', index: 1 });
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
    expect(
      destinationFor({ type: 'card', tierId: 'S', filmId: 'ghost' }, board(), 'x'),
    ).toBeNull();
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/ui/board/dropTarget.test.ts`
Expected: FAIL — `Failed to resolve import "@/ui/board/dropTarget"`.

- [ ] **Step 4: Write the module**

Create `src/ui/board/dropTarget.ts`:

```ts
import type { Destination, TierBoard } from '@/domain/tiers';

/**
 * What the pointer (or the keyboard cursor) ended over. Deliberately a plain
 * shape rather than dnd-kit's `over` object: everything decided here is
 * decidable from these three cases, and keeping the library's types out means
 * this module is testable without a DOM.
 */
export type DropTarget =
  | { type: 'tier'; tierId: string }
  // tierId is null for a card sitting in the pool, which is what BoardCard
  // passes for its own `data`. Dropping onto such a card means the pool.
  | { type: 'card'; tierId: string | null; filmId: string }
  | { type: 'pool' };

/**
 * Where the dragged film should end up, or null if the drop should be ignored
 * entirely.
 *
 * Null matters as much as the destinations do: dispatching a move that changes
 * nothing would push an identical board onto the undo history, so the next
 * Ctrl+Z would appear to do nothing at all.
 */
export function destinationFor(
  target: DropTarget,
  board: TierBoard,
  draggedId: string,
): Destination | null {
  if (target.type === 'pool') return 'pool';
  if (target.type === 'card' && target.tierId === null) return 'pool';

  const ids = board.placements[target.tierId];
  if (!ids) return null;

  // A film lifted out of this row is no longer occupying a position in it, so
  // every index at or after its old one has already shifted down by one. The
  // drop point the user aimed at is the *post-removal* index.
  const from = ids.indexOf(draggedId);
  const shift = (index: number) => (from !== -1 && from < index ? index - 1 : index);

  if (target.type === 'tier') return { tierId: target.tierId, index: shift(ids.length) };

  if (target.filmId === draggedId) return null;
  const over = ids.indexOf(target.filmId);
  if (over === -1) return null;

  return { tierId: target.tierId, index: shift(over) };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ui/board/dropTarget.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Mutation-check**

1. Replace `shift(over)` with `over`. Expected: **"accounts for the dragged card leaving its own row first"** goes red with `expected { tierId: 'S', index: 2 } to deeply equal { tierId: 'S', index: 1 }`.
2. Replace `if (target.filmId === draggedId) return null;` with nothing. Expected: **"returns null when a card is dropped on itself"** goes red.

- [ ] **Step 7: Full suite, typecheck, lint**

Run: `npm run test:run && npm run typecheck && npm run lint`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/ui/board/dropTarget.ts tests/ui/board/dropTarget.test.ts
git commit -m "feat(ui): decide where a dragged film lands, without a DOM"
```

---

### Task 6: A draggable card and a tier row

**Files:**

- Create: `src/ui/board/BoardCard.tsx`
- Create: `src/ui/board/TierRow.tsx`
- Test: `tests/ui/board/TierRow.test.tsx`

**Interfaces:**

- Consumes: `Tier`, `TierColor` from `@/domain/tiers`, `Film` from `@/domain/film`, `useSortable`/`useDroppable` from dnd-kit.
- Produces: `BoardCard({ film, tierId })`, `TierRow({ tier, films, children? })`, and `tierColorVar(color)`. Task 7 reuses `BoardCard`; Task 8 renders `TierRow`; Task 10 mounts controls inside the row header.

**The colour rule, and how a row satisfies it.** `src/ui/**` may hold no colour literal. A row's colour is a token *name* from the domain, so the component turns `'s'` into `var(--color-tier-s)` by construction — a template over the six known names, never a value.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/board/TierRow.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { TierRow, tierColorVar } from '@/ui/board/TierRow';
import { DEFAULT_TIERS } from '@/domain/tiers';
import { makeFilm } from '../../support/film';

const tier = DEFAULT_TIERS[0]!;
const films = [makeFilm({ title: 'Heat' }), makeFilm({ title: 'Dune' })];

function renderRow(props: Partial<Parameters<typeof TierRow>[0]> = {}) {
  return render(
    <DndContext>
      <TierRow tier={tier} films={films} {...props} />
    </DndContext>,
  );
}

describe('tierColorVar', () => {
  it('turns a token name into that token, and nothing else', () => {
    // The one place src/ui/** is allowed near a colour: a template over the
    // six known names. A regression to a literal would break the lint rule
    // this project enforces on the whole directory.
    expect(tierColorVar('s')).toBe('var(--color-tier-s)');
    expect(tierColorVar('f')).toBe('var(--color-tier-f)');
  });
});

describe('TierRow', () => {
  it('is a labelled region carrying the row name', () => {
    renderRow();
    expect(screen.getByRole('list', { name: /^S\b/ })).toBeInTheDocument();
  });

  it('renders one card per film, in the order given', () => {
    renderRow();
    const titles = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(titles).toEqual(['Heat', 'Dune']);
  });

  it('says a row is empty rather than showing nothing at all', () => {
    // An empty row that renders as a bare strip gives no drop affordance and
    // no explanation; a screen-reader user meets a list with no items and no
    // reason why.
    renderRow({ films: [] });
    expect(screen.getByText(/drop films here/i)).toBeInTheDocument();
  });

  it('announces how many films the row holds', () => {
    renderRow();
    expect(screen.getByRole('list', { name: /2 films/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/board/TierRow.test.tsx`
Expected: FAIL — `Failed to resolve import "@/ui/board/TierRow"`.

- [ ] **Step 3: Write the card**

Create `src/ui/board/BoardCard.tsx`:

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Film } from '@/domain/film';

interface BoardCardProps {
  film: Film;
  /** The row this card sits in, or null while it is in the pool. */
  tierId: string | null;
}

/**
 * One poster, draggable by pointer and by keyboard.
 *
 * `data` is what Task 5's translation reads back on drop: dnd-kit hands the
 * whole object to `onDragEnd`, so the card is where a drop target describes
 * itself rather than somewhere a lookup has to reconstruct it.
 */
export function BoardCard({ film, tierId }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: film.id,
    data: { type: 'card', tierId, filmId: film.id },
  });

  // A plain div, not an <li>: this card renders both inside a row's list and
  // inside the pool's grid, and an <li> in the grid would be a list item with
  // no list. TierRow supplies the <li> around it.
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${isDragging ? 'opacity-40' : ''} w-full`}
      {...attributes}
      {...listeners}
    >
      {/* The title appears exactly once, so a card's text content is the
          film's name and nothing else. With a poster it is visually hidden
          and the image is decorative; without one it *is* the card. */}
      {film.posterPath && (
        <img
          src={`https://image.tmdb.org/t/p/w154${film.posterPath}`}
          alt=""
          className="aspect-[2/3] w-full rounded-card object-cover"
        />
      )}
      <span
        className={
          film.posterPath
            ? 'sr-only'
            : 'flex aspect-[2/3] w-full items-center justify-center rounded-card border border-line p-1 text-center text-[10px] leading-tight text-ink-dim'
        }
      >
        {film.title}
      </span>
    </div>
  );
}
```

**Why the title is in a span rather than the image's `alt`.** One element carries the name in both states — visually hidden behind a poster, visible when there is none. An `alt` plus a fallback would announce the title twice in one state and, more practically, would make a card's text content `"HeatHeat"`, which is what the row test above pins against.

- [ ] **Step 4: Write the row**

Create `src/ui/board/TierRow.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Film } from '@/domain/film';
import type { Tier, TierColor } from '@/domain/tiers';
import { BoardCard } from './BoardCard';

/**
 * A token name from the domain becomes that token and nothing else. This is a
 * template over six known names, not a colour value — which is what keeps
 * src/ui/** free of colour literals while still letting a row be recoloured.
 */
export function tierColorVar(color: TierColor): string {
  return `var(--color-tier-${color})`;
}

interface TierRowProps {
  tier: Tier;
  films: Film[];
  /** The row's edit controls, mounted by Task 10. */
  children?: ReactNode;
}

export function TierRow({ tier, films, children }: TierRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `tier:${tier.id}`,
    data: { type: 'tier', tierId: tier.id },
  });

  const label = `${tier.label} — ${films.length === 1 ? '1 film' : `${String(films.length)} films`}`;

  return (
    <div className="flex items-stretch gap-2">
      <div
        className="flex w-14 shrink-0 items-center justify-center rounded-card font-display text-lg text-[#000]"
        style={{ backgroundColor: tierColorVar(tier.color) }}
      >
        {tier.label}
      </div>

      <div className="min-w-0 flex-1">
        {children}
        <SortableContext items={films.map((film) => film.id)} strategy={horizontalListSortingStrategy}>
          <ul
            ref={setNodeRef}
            aria-label={label}
            className={`flex min-h-24 flex-wrap gap-2 rounded-card border p-2 ${
              isOver ? 'border-accent' : 'border-line'
            }`}
          >
            {films.length === 0 ? (
              <li className="self-center px-2 text-sm text-ink-dim">Drop films here</li>
            ) : (
              films.map((film) => (
                <li key={film.id} className="w-16 shrink-0 sm:w-20">
                  <BoardCard film={film} tierId={tier.id} />
                </li>
              ))
            )}
          </ul>
        </SortableContext>
      </div>
    </div>
  );
}
```

**`text-[#000]` is a colour literal and must not ship.** Replace it with the existing ink-on-accent token if one exists, or add `--color-on-tier` to `src/index.css` under both themes and use `text-on-tier`. Check `src/index.css` for what is already defined before adding a token; the lint rule will reject the literal either way, so this is not optional and the test suite is not what catches it — `npm run lint` is.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/ui/board/TierRow.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Mutation-check**

1. In `tierColorVar`, return a hardcoded `'var(--color-tier-s)'`. Expected: **"turns a token name into that token, and nothing else"** goes red on the `'f'` case.
2. Remove the `films.length === 0` branch. Expected: **"says a row is empty rather than showing nothing at all"** goes red.

- [ ] **Step 7: Full suite, typecheck, lint**

Run: `npm run test:run && npm run typecheck && npm run lint`
Expected: green, **including lint** — the colour-literal rule covers this new directory.

- [ ] **Step 8: Commit**

```bash
git add src/ui/board/BoardCard.tsx src/ui/board/TierRow.tsx tests/ui/board/TierRow.test.tsx src/index.css
git commit -m "feat(ui): draw a tier row and the cards it holds"
```

---

### Task 7: The pool

**Files:**

- Modify: `src/ui/library/FilmGrid.tsx` (accept an optional cell renderer)
- Create: `src/ui/board/Pool.tsx`
- Test: `tests/ui/board/Pool.test.tsx`

**Interfaces:**

- Consumes: `Film`, `FilmGrid` from `@/ui/library/FilmGrid`, `useDroppable`.
- Produces: `Pool({ films, search, onSearchChange })`. Task 8 renders it; Task 11 owns the search state.

**The pool's cards must be draggable, and `FilmGrid` renders `FilmCard`.** Dragging a poster out of the pool is the board's central action, so the pool cannot render the library's plain card. Rather than duplicating the virtualiser, `FilmGrid` gains one optional prop:

```ts
  /**
   * What to draw in a cell. Defaults to the library's own card; the board's
   * pool passes a draggable one. The grid owns layout and virtualisation and
   * has no opinion about the cell.
   */
  renderCard?: (film: Film) => ReactNode;
```

used at its single call site as `{renderCard ? renderCard(film) : <FilmCard film={film} />}`. Every existing caller omits it and is unaffected — assert that by leaving `tests/ui/FilmGrid.test.tsx` untouched and green.

**What the pool is.** The grid that already ships, as a drop target, with a title search. The rail filters it by every axis the domain understands; the search covers the one axis the rail has no control for — "where is Heat" — and is deliberately not a criterion: not persisted, not a chip, not part of `FilterCriteria`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/board/Pool.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { Pool } from '@/ui/board/Pool';
import { makeFilm } from '../../support/film';

const films = [makeFilm({ title: 'Heat' }), makeFilm({ title: 'Dune' })];

function renderPool(props: Partial<Parameters<typeof Pool>[0]> = {}) {
  const onSearchChange = vi.fn();
  render(
    <DndContext>
      <Pool films={films} search="" onSearchChange={onSearchChange} {...props} />
    </DndContext>,
  );
  return { onSearchChange };
}

describe('Pool', () => {
  it('counts what it is holding', () => {
    renderPool();
    expect(screen.getByText('2 films to place')).toBeInTheDocument();
  });

  it('uses the singular for one film', () => {
    renderPool({ films: [films[0]!] });
    expect(screen.getByText('1 film to place')).toBeInTheDocument();
  });

  it('reports what was typed, without filtering anything itself', () => {
    // The pool is controlled: App owns the search text and hands down the
    // already-narrowed list. A Pool that filtered internally would disagree
    // with the count above the moment the rail also had something to say.
    const { onSearchChange } = renderPool();
    fireEvent.change(screen.getByLabelText('Search the pool'), { target: { value: 'hea' } });
    expect(onSearchChange).toHaveBeenCalledWith('hea');
  });

  it('explains an empty pool rather than showing a blank area', () => {
    renderPool({ films: [] });
    expect(screen.getByText(/every film is placed/i)).toBeInTheDocument();
  });

  it('explains an empty pool differently when a search is what emptied it', () => {
    renderPool({ films: [], search: 'zzz' });
    expect(screen.getByText(/no film in the pool matches/i)).toBeInTheDocument();
  });

  it('renders draggable cards, not the library’s plain ones', () => {
    // Dragging out of the pool is the board's central action. FilmGrid's own
    // FilmCard is not a draggable, so a pool that fell back to it would look
    // right and do nothing — the exact defect this test exists to catch.
    renderPool();
    const card = screen.getByText('Heat').closest('[role="button"], [aria-roledescription]');
    expect(card).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/board/Pool.test.tsx`
Expected: FAIL — `Failed to resolve import "@/ui/board/Pool"`.

- [ ] **Step 3: Write the component**

Create `src/ui/board/Pool.tsx`:

```tsx
import { useId } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Film } from '@/domain/film';
import { FilmGrid } from '@/ui/library/FilmGrid';
import { BoardCard } from './BoardCard';

interface PoolProps {
  /** Already narrowed by the rail and by `search`; the pool renders what it is given. */
  films: Film[];
  search: string;
  onSearchChange: (next: string) => void;
}

export function Pool({ films, search, onSearchChange }: PoolProps) {
  const searchId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', data: { type: 'pool' } });

  return (
    <section
      ref={setNodeRef}
      aria-label="Pool"
      className={`space-y-2 rounded-card border p-2 ${isOver ? 'border-accent' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-dim">
          {films.length === 1 ? '1 film to place' : `${String(films.length)} films to place`}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor={searchId} className="text-sm text-ink-dim">
            Search the pool
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => {
              onSearchChange(event.target.value);
            }}
            className="rounded-card border border-line bg-surface px-2 py-1 text-sm text-ink focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {films.length === 0 ? (
        <p className="p-4 text-center text-sm text-ink-dim">
          {search === ''
            ? 'Every film is placed. Drag one back here to unrank it.'
            : 'No film in the pool matches that search.'}
        </p>
      ) : (
        <FilmGrid films={films} renderCard={(film) => <BoardCard film={film} tierId={null} />} />
      )}
    </section>
  );
}
```

**`FilmGrid` is rendered without a `generation` prop on purpose.** Its entrance animation means "a new import arrived"; replaying it every time the pool shrinks by one card would animate the whole grid on every drop. Omitting the prop leaves it at its default, which plays once on mount and then stays still.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/board/Pool.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Mutation-check**

0. Drop the `renderCard` prop from the `FilmGrid` call so the pool falls back to `FilmCard`. Expected: **"renders draggable cards, not the library's plain ones"** goes red.

1. Make `Pool` filter internally — `films.filter(f => f.title.toLowerCase().includes(search.toLowerCase()))` — and drop the `onSearchChange` call. Expected: **"reports what was typed, without filtering anything itself"** goes red.
2. Collapse the two empty-pool messages into one. Expected: **"explains an empty pool differently when a search is what emptied it"** goes red.

- [ ] **Step 6: Full suite, typecheck, lint**

Run: `npm run test:run && npm run typecheck && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/ui/library/FilmGrid.tsx src/ui/board/Pool.tsx tests/ui/board/Pool.test.tsx
git commit -m "feat(ui): make the library grid the board's pool"
```

---

### Task 8: The board screen, its sensors and what it announces

**Files:**

- Create: `src/ui/board/announcements.ts`
- Create: `src/ui/board/BoardScreen.tsx`
- Test: `tests/ui/board/announcements.test.ts`
- Test: `tests/ui/board/BoardScreen.test.tsx`

**Interfaces:**

- Consumes: `TierBoard`, `poolFor`, `BoardAction` from `@/domain/board`, `destinationFor` from Task 5, `TierRow`, `Pool`.
- Produces: `boardAnnouncements(describe)`, `BoardScreen({ board, films, poolFilms, search, onSearchChange, dispatch })`. Task 11 renders it and supplies `dispatch`.

**Why announcements are a separate module.** dnd-kit's `accessibility.announcements` is an object of pure functions from drag events to strings — exactly the part of keyboard operation that can be tested precisely, and exactly the part most likely to ship as the library's defaults ("Draggable item 3 was moved") because nobody looked. Pulled out, the wording is assertable; left inline, it is not.

- [ ] **Step 1: Write the failing announcement tests**

Create `tests/ui/board/announcements.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { boardAnnouncements } from '@/ui/board/announcements';

const describeItem = (id: string) => {
  if (id === 'heat') return { title: 'Heat', where: 'the pool' };
  if (id === 'dune') return { title: 'Dune', where: 'tier A, position 2 of 3' };
  return null;
};

const announce = boardAnnouncements(describeItem);

describe('boardAnnouncements', () => {
  it('names the film and where it came from on lift', () => {
    expect(announce.onDragStart({ active: { id: 'heat' } })).toBe('Heat lifted from the pool.');
  });

  it('names the film and where it is hovering on move', () => {
    expect(announce.onDragOver({ active: { id: 'heat' }, over: { id: 'dune' } })).toBe(
      'Heat is over tier A, position 2 of 3.',
    );
  });

  it('names where the film landed on drop', () => {
    expect(announce.onDragEnd({ active: { id: 'heat' }, over: { id: 'dune' } })).toBe(
      'Heat dropped into tier A, position 2 of 3.',
    );
  });

  it('says a drop went nowhere rather than staying silent', () => {
    // Silence after a drop is indistinguishable from a drop that worked.
    expect(announce.onDragEnd({ active: { id: 'heat' }, over: null })).toBe(
      'Heat was not moved.',
    );
  });

  it('says a cancelled drag was cancelled', () => {
    expect(announce.onDragCancel({ active: { id: 'heat' } })).toBe('Moving Heat was cancelled.');
  });

  it('falls back to a neutral phrase for an id it cannot describe', () => {
    // Never throws mid-drag: an unknown id is a bug, but a screen reader
    // going silent because a lookup returned null is a worse one.
    expect(announce.onDragStart({ active: { id: 'ghost' } })).toBe('Item lifted.');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/board/announcements.test.ts`
Expected: FAIL — `Failed to resolve import "@/ui/board/announcements"`.

- [ ] **Step 3: Write the announcements**

Create `src/ui/board/announcements.ts`:

```ts
/** What a draggable or droppable id refers to, in words a person can hear. */
export interface ItemDescription {
  title: string;
  /** "the pool", or "tier A, position 2 of 3". */
  where: string;
}

type Id = string | number;
type Arg = { active: { id: Id }; over?: { id: Id } | null };

/**
 * The strings a screen reader hears during a drag.
 *
 * dnd-kit ships defaults ("Draggable item 3 was moved over droppable area 2"),
 * which are accurate and useless: they name the library's abstractions instead
 * of the user's films and rows. These name the film and the row.
 */
export function boardAnnouncements(describe: (id: string) => ItemDescription | null) {
  const of = (id: Id) => describe(String(id));

  return {
    onDragStart({ active }: Arg) {
      const item = of(active.id);
      return item ? `${item.title} lifted from ${item.where}.` : 'Item lifted.';
    },
    onDragOver({ active, over }: Arg) {
      const item = of(active.id);
      const target = over ? of(over.id) : null;
      if (!item) return 'Item moved.';
      if (!target) return `${item.title} is over nothing droppable.`;
      return `${item.title} is over ${target.where}.`;
    },
    onDragEnd({ active, over }: Arg) {
      const item = of(active.id);
      if (!item) return 'Item dropped.';
      const target = over ? of(over.id) : null;
      // Silence after a drop cannot be told apart from a drop that worked.
      if (!target) return `${item.title} was not moved.`;
      return `${item.title} dropped into ${target.where}.`;
    },
    onDragCancel({ active }: Arg) {
      const item = of(active.id);
      return item ? `Moving ${item.title} was cancelled.` : 'Moving was cancelled.';
    },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/ui/board/announcements.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing screen test**

Create `tests/ui/board/BoardScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardScreen } from '@/ui/board/BoardScreen';
import { createBoard, moveFilm, DEFAULT_TIERS } from '@/domain/tiers';
import { makeFilm } from '../../support/film';

const heat = makeFilm({ title: 'Heat' });
const dune = makeFilm({ title: 'Dune' });
const films = [heat, dune];

function renderScreen(overrides: Partial<Parameters<typeof BoardScreen>[0]> = {}) {
  const dispatch = vi.fn();
  const board = moveFilm(createBoard('b1', 'Mine'), heat.id, { tierId: 'S', index: 0 });
  render(
    <BoardScreen
      board={board}
      films={films}
      poolFilms={[dune]}
      search=""
      onSearchChange={vi.fn()}
      dispatch={dispatch}
      {...overrides}
    />,
  );
  return { dispatch, board };
}

describe('BoardScreen', () => {
  it('renders one row per tier, in the board’s order', () => {
    renderScreen();
    const rows = screen.getAllByRole('list').filter((list) => list.getAttribute('aria-label'));
    expect(rows.map((row) => row.getAttribute('aria-label')?.split(' —')[0])).toEqual(
      DEFAULT_TIERS.map((tier) => tier.label),
    );
  });

  it('shows a placed film in its row and not in the pool', () => {
    renderScreen();
    const s = screen.getByRole('list', { name: /^S —/ });
    expect(s).toHaveTextContent('Heat');
    expect(s).not.toHaveTextContent('Dune');
  });

  it('renders the pool below the rows', () => {
    renderScreen();
    expect(screen.getByRole('region', { name: 'Pool' })).toBeInTheDocument();
  });

  it('skips a placement whose film the library no longer holds', () => {
    // The board deliberately keeps such a placement so a re-import restores
    // it. Rendering must not crash on it, and must not draw an empty card.
    const board = moveFilm(createBoard('b1', 'Mine'), 'ghost', { tierId: 'S', index: 0 });
    renderScreen({ board, poolFilms: films });
    expect(screen.getByRole('list', { name: /^S — 0 films/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/ui/board/BoardScreen.test.tsx`
Expected: FAIL — `Failed to resolve import "@/ui/board/BoardScreen"`.

- [ ] **Step 7: Write the screen**

Create `src/ui/board/BoardScreen.tsx`:

```tsx
import { useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Film } from '@/domain/film';
import type { TierBoard } from '@/domain/tiers';
import type { BoardAction } from '@/domain/board';
import { TierRow } from './TierRow';
import { Pool } from './Pool';
import { destinationFor, type DropTarget } from './dropTarget';
import { boardAnnouncements, type ItemDescription } from './announcements';

interface BoardScreenProps {
  board: TierBoard;
  /** The whole library, for resolving placed ids to films. */
  films: Film[];
  /** What the pool should show: already narrowed by the rail and the search. */
  poolFilms: Film[];
  search: string;
  onSearchChange: (next: string) => void;
  dispatch: (action: BoardAction) => void;
}

export function BoardScreen({
  board,
  films,
  poolFilms,
  search,
  onSearchChange,
  dispatch,
}: BoardScreenProps) {
  const byId = useMemo(() => new Map(films.map((film) => [film.id, film])), [films]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Without a small distance, every click on a poster starts a drag and
      // the card never receives a plain click.
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const describe = (id: string): ItemDescription | null => {
    if (id === 'pool') return { title: 'Pool', where: 'the pool' };

    const tierId = id.startsWith('tier:') ? id.slice('tier:'.length) : null;
    if (tierId !== null) {
      const tier = board.tiers.find((candidate) => candidate.id === tierId);
      return tier ? { title: tier.label, where: `tier ${tier.label}` } : null;
    }

    const film = byId.get(id);
    if (!film) return null;
    for (const tier of board.tiers) {
      const ids = board.placements[tier.id] ?? [];
      const index = ids.indexOf(id);
      if (index !== -1) {
        return {
          title: film.title,
          where: `tier ${tier.label}, position ${String(index + 1)} of ${String(ids.length)}`,
        };
      }
    }
    return { title: film.title, where: 'the pool' };
  };

  function onDragEnd(event: DragEndEvent) {
    const target = event.over?.data.current as DropTarget | undefined;
    if (!target) return;
    const destination = destinationFor(target, board, String(event.active.id));
    // null means "changed nothing": dispatching anyway would push an identical
    // board onto the undo history and make the next undo look broken.
    if (!destination) return;
    dispatch({ type: 'move', filmId: String(event.active.id), to: destination });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements: boardAnnouncements(describe) }}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {board.tiers.map((tier) => (
            <TierRow
              key={tier.id}
              tier={tier}
              films={(board.placements[tier.id] ?? [])
                .map((id) => byId.get(id))
                .filter((film): film is Film => film !== undefined)}
            />
          ))}
        </div>

        <Pool films={poolFilms} search={search} onSearchChange={onSearchChange} />
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/ui/board/BoardScreen.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 9: Attempt a real keyboard test, and be honest about the result**

Add to `tests/ui/board/BoardScreen.test.tsx` an attempt to operate a card by keyboard alone: focus the card, press `Space`, press `ArrowRight` or `ArrowDown`, press `Space`, and assert `dispatch` was called with a `move`.

**dnd-kit's keyboard sensor computes coordinates from `getBoundingClientRect`, which jsdom reports as all zeros.** The test may therefore be unable to produce a meaningful `over` target. If, after a genuine attempt, it cannot be made to assert real behaviour:

- delete the attempt rather than leaving a test that passes without proving anything,
- write in your report exactly what you tried and where it failed,
- and say so plainly. It becomes a manual-verification item in Task 12, in the same way this project already records the responsive layout as unverifiable from an automated tab.

A keyboard test that passes because `dispatch` was called with a destination jsdom invented is worse than no test at all. This project has found eight tests that could not fail; do not ship the ninth.

- [ ] **Step 10: Mutation-check**

1. In `onDragEnd`, remove the `if (!destination) return;` guard and dispatch unconditionally with a fallback. Expected: the guard's absence is not covered by the screen tests — **note this in the report**; the behaviour it protects is covered by `dropTarget.test.ts`'s null cases, which are the tests that matter for it.
2. In the `TierRow` mapping, remove the `.filter((film): film is Film => film !== undefined)`. Expected: **"skips a placement whose film the library no longer holds"** goes red (or the render throws), which is the point.

- [ ] **Step 11: Full suite, typecheck, lint**

Run: `npm run test:run && npm run typecheck && npm run lint`

- [ ] **Step 12: Commit**

```bash
git add src/ui/board/announcements.ts src/ui/board/BoardScreen.tsx tests/ui/board/announcements.test.ts tests/ui/board/BoardScreen.test.tsx
git commit -m "feat(ui): assemble the board, its sensors and what it announces"
```

---

### Task 9: Pre-filling from ratings

**Files:**

- Create: `src/ui/board/PrefillPanel.tsx`
- Test: `tests/ui/board/PrefillPanel.test.tsx`

**Interfaces:**

- Consumes: `Tier`, `poolFor`, `prefill` from `@/domain/tiers`, `BoardAction`.
- Produces: `PrefillPanel({ board, films, dispatch })`. Task 11 mounts it above the rows.

**Why the thresholds live here and nowhere else.** A threshold has exactly one effect: which row a pre-fill drops a film into. A separate settings dialog for a value with one consumer is a second place to look for the same thing. The panel shows each threshold with the number of pooled films it would currently place, so the effect is visible before it happens.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/board/PrefillPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefillPanel } from '@/ui/board/PrefillPanel';
import { createBoard, moveFilm } from '@/domain/tiers';
import { makeFilm } from '../../support/film';

const heat = makeFilm({ title: 'Heat', rating: 95 });
const dune = makeFilm({ title: 'Dune', rating: 82 });
const unrated = makeFilm({ title: 'Unrated', rating: null });
const films = [heat, dune, unrated];

function renderPanel(overrides: Partial<Parameters<typeof PrefillPanel>[0]> = {}) {
  const dispatch = vi.fn();
  render(
    <PrefillPanel board={createBoard('b1', 'Mine')} films={films} dispatch={dispatch} {...overrides} />,
  );
  return { dispatch };
}

describe('PrefillPanel', () => {
  it('shows how many pooled films each threshold would place', () => {
    renderPanel();
    expect(screen.getByRole('group', { name: /thresholds/i })).toBeInTheDocument();
    expect(screen.getByLabelText('S — lowest rating')).toHaveValue(90);
    expect(screen.getByText('S would take 1')).toBeInTheDocument();
    expect(screen.getByText('A would take 1')).toBeInTheDocument();
  });

  it('counts only films that are still in the pool', () => {
    // Pre-filling never rearranges a hand-placed film, so a count that
    // included one would promise something the action does not do.
    const placed = moveFilm(createBoard('b1', 'Mine'), heat.id, { tierId: 'F', index: 0 });
    renderPanel({ board: placed });
    expect(screen.getByText('S would take 0')).toBeInTheDocument();
  });

  it('says how many films it will not place at all', () => {
    renderPanel();
    expect(screen.getByText(/1 unrated film stays in the pool/i)).toBeInTheDocument();
  });

  it('changing a threshold dispatches, and does not pre-fill by itself', () => {
    // Editing a number must not move anything: the effect is previewed, then
    // applied on purpose.
    const { dispatch } = renderPanel();
    fireEvent.change(screen.getByLabelText('S — lowest rating'), { target: { value: '97' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setThreshold', tierId: 'S', minRating: 97 });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'prefill' }));
  });

  it('applies the pre-fill on the action, with the library it was shown', async () => {
    const { dispatch } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /pre-fill from my ratings/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'prefill', films });
  });

  it('sends everything back to the pool on the inverse action', async () => {
    const { dispatch } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /send everything back/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearToPool' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/board/PrefillPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "@/ui/board/PrefillPanel"`.

- [ ] **Step 3: Write the panel**

Create `src/ui/board/PrefillPanel.tsx`:

```tsx
import { useId, useMemo } from 'react';
import type { Film } from '@/domain/film';
import { poolFor, prefill, type TierBoard } from '@/domain/tiers';
import type { BoardAction } from '@/domain/board';

interface PrefillPanelProps {
  board: TierBoard;
  films: Film[];
  dispatch: (action: BoardAction) => void;
}

export function PrefillPanel({ board, films, dispatch }: PrefillPanelProps) {
  const groupId = useId();

  // What pre-filling would do right now, computed by running the real
  // operation rather than by reimplementing its rules here — a preview that
  // disagrees with the action is worse than no preview.
  const preview = useMemo(() => prefill(board, films), [board, films]);
  const pooled = useMemo(() => poolFor(board, films), [board, films]);
  const unratedCount = pooled.filter((film) => film.rating === null).length;

  const gained = (tierId: string) =>
    (preview.placements[tierId]?.length ?? 0) - (board.placements[tierId]?.length ?? 0);

  return (
    <section className="space-y-3 rounded-card border border-line p-3">
      <fieldset id={groupId} aria-label="Pre-fill thresholds" className="space-y-2">
        {board.tiers.map((tier) => (
          <div key={tier.id} className="flex flex-wrap items-center gap-3 text-sm">
            <label htmlFor={`${groupId}-${tier.id}`} className="text-ink-dim">
              {tier.label} — lowest rating
            </label>
            <input
              id={`${groupId}-${tier.id}`}
              type="number"
              min={0}
              max={100}
              value={tier.minRating ?? ''}
              placeholder="everything else"
              onChange={(event) => {
                const raw = event.target.value;
                dispatch({
                  type: 'setThreshold',
                  tierId: tier.id,
                  minRating: raw === '' ? null : Number(raw),
                });
              }}
              className="w-24 rounded-card border border-line bg-surface px-2 py-1 text-ink focus:ring-2 focus:ring-accent"
            />
            <span className="text-ink-dim">{`${tier.label} would take ${String(gained(tier.id))}`}</span>
          </div>
        ))}
      </fieldset>

      {unratedCount > 0 && (
        <p className="text-sm text-ink-dim">
          {unratedCount === 1
            ? '1 unrated film stays in the pool — a rating is what this sorts by.'
            : `${String(unratedCount)} unrated films stay in the pool — a rating is what this sorts by.`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'prefill', films });
          }}
          className="rounded-card border border-line px-3 py-2 text-sm text-ink hover:border-accent focus:ring-2 focus:ring-accent"
        >
          Pre-fill from my ratings
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'clearToPool' });
          }}
          className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent"
        >
          Send everything back to the pool
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/ui/board/PrefillPanel.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Mutation-check**

1. In `gained`, drop the subtraction and return `preview.placements[tierId]?.length ?? 0`. Expected: **"counts only films that are still in the pool"** goes red — S would report 1 where the pool holds nothing for it.
2. Make the threshold input also dispatch `prefill`. Expected: **"changing a threshold dispatches, and does not pre-fill by itself"** goes red.

- [ ] **Step 6: Full suite, typecheck, lint**

Run: `npm run test:run && npm run typecheck && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/ui/board/PrefillPanel.tsx tests/ui/board/PrefillPanel.test.tsx
git commit -m "feat(ui): preview and apply a pre-fill from imported ratings"
```

---

### Task 10: Editing a row

**Files:**

- Create: `src/ui/board/TierRowControls.tsx`
- Modify: `src/ui/board/BoardScreen.tsx` (mount the controls inside each row)
- Test: `tests/ui/board/TierRowControls.test.tsx`

**Interfaces:**

- Consumes: `Tier`, `TIER_COLORS`, `TierColor`, `BoardAction`.
- Produces: `TierRowControls({ tier, index, tierCount, dispatch })`.

**Colours are picked, not typed.** `TIER_COLORS` is the six token names the theme defines. A free-form colour input would let a user destroy the contrast the whole visual identity rests on, and would put a colour value in `src/ui/**`, which the lint rule forbids.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/board/TierRowControls.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TierRowControls } from '@/ui/board/TierRowControls';
import { DEFAULT_TIERS, TIER_COLORS } from '@/domain/tiers';

const tier = DEFAULT_TIERS[0]!;

function renderControls(overrides: Partial<Parameters<typeof TierRowControls>[0]> = {}) {
  const dispatch = vi.fn();
  render(
    <TierRowControls tier={tier} index={0} tierCount={6} dispatch={dispatch} {...overrides} />,
  );
  return { dispatch };
}

describe('TierRowControls', () => {
  it('renames a row', () => {
    const { dispatch } = renderControls();
    fireEvent.change(screen.getByLabelText('Row S label'), { target: { value: 'Godlike' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'renameTier', tierId: 'S', label: 'Godlike' });
  });

  it('offers exactly the theme’s tier colours and no free-form input', () => {
    renderControls();
    const select = screen.getByLabelText('Row S colour');
    expect([...select.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual([
      ...TIER_COLORS,
    ]);
    expect(document.querySelector('input[type="color"]')).toBeNull();
  });

  it('recolours a row', () => {
    const { dispatch } = renderControls();
    fireEvent.change(screen.getByLabelText('Row S colour'), { target: { value: 'c' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'recolorTier', tierId: 'S', color: 'c' });
  });

  it('adds a row after this one', async () => {
    const { dispatch } = renderControls();
    await userEvent.click(screen.getByRole('button', { name: 'Add a row below S' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'addTier', afterTierId: 'S' });
  });

  it('removes a row', async () => {
    const { dispatch } = renderControls();
    await userEvent.click(screen.getByRole('button', { name: 'Remove row S' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeTier', tierId: 'S' });
  });

  it('says what removing a row does with its films, in the name of the control', () => {
    // "Remove" beside a row holding forty posters reads as "delete forty
    // films" unless the control says otherwise.
    renderControls();
    expect(screen.getByRole('button', { name: 'Remove row S' })).toHaveAccessibleDescription(
      /returns its films to the pool/i,
    );
  });

  it('cannot remove the only remaining row', () => {
    renderControls({ tierCount: 1 });
    expect(screen.getByRole('button', { name: 'Remove row S' })).toBeDisabled();
  });

  it('moves a row up and down, and stops at the ends', async () => {
    const { dispatch } = renderControls({ index: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Move row S up' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'moveTier', tierId: 'S', toIndex: 0 });

    renderControls({ index: 0 });
    expect(screen.getAllByRole('button', { name: 'Move row S up' })[1]).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/board/TierRowControls.test.tsx`
Expected: FAIL — `Failed to resolve import "@/ui/board/TierRowControls"`.

- [ ] **Step 3: Write the controls**

Create `src/ui/board/TierRowControls.tsx`:

```tsx
import { useId } from 'react';
import { TIER_COLORS, type Tier, type TierColor } from '@/domain/tiers';
import type { BoardAction } from '@/domain/board';

interface TierRowControlsProps {
  tier: Tier;
  index: number;
  tierCount: number;
  dispatch: (action: BoardAction) => void;
}

const BUTTON =
  'rounded-card border border-line px-2 py-1 text-xs text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent disabled:opacity-40';

export function TierRowControls({ tier, index, tierCount, dispatch }: TierRowControlsProps) {
  const removeHintId = useId();

  return (
    <div className="mb-1 flex flex-wrap items-center gap-2">
      <label htmlFor={`${tier.id}-label`} className="sr-only">
        {`Row ${tier.label} label`}
      </label>
      <input
        id={`${tier.id}-label`}
        value={tier.label}
        maxLength={24}
        onChange={(event) => {
          dispatch({ type: 'renameTier', tierId: tier.id, label: event.target.value });
        }}
        className="w-28 rounded-card border border-line bg-surface px-2 py-1 text-xs text-ink focus:ring-2 focus:ring-accent"
      />

      <label htmlFor={`${tier.id}-color`} className="sr-only">
        {`Row ${tier.label} colour`}
      </label>
      <select
        id={`${tier.id}-color`}
        value={tier.color}
        onChange={(event) => {
          dispatch({
            type: 'recolorTier',
            tierId: tier.id,
            color: event.target.value as TierColor,
          });
        }}
        className="rounded-card border border-line bg-surface px-2 py-1 text-xs text-ink focus:ring-2 focus:ring-accent"
      >
        {TIER_COLORS.map((color) => (
          <option key={color} value={color}>
            {color.toUpperCase()}
          </option>
        ))}
      </select>

      <button
        type="button"
        className={BUTTON}
        onClick={() => {
          dispatch({ type: 'moveTier', tierId: tier.id, toIndex: index - 1 });
        }}
        disabled={index === 0}
      >
        {`Move row ${tier.label} up`}
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => {
          dispatch({ type: 'moveTier', tierId: tier.id, toIndex: index + 1 });
        }}
        disabled={index === tierCount - 1}
      >
        {`Move row ${tier.label} down`}
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => {
          dispatch({ type: 'addTier', afterTierId: tier.id });
        }}
      >
        {`Add a row below ${tier.label}`}
      </button>
      <button
        type="button"
        className={BUTTON}
        aria-describedby={removeHintId}
        onClick={() => {
          dispatch({ type: 'removeTier', tierId: tier.id });
        }}
        disabled={tierCount === 1}
      >
        {`Remove row ${tier.label}`}
      </button>
      <span id={removeHintId} className="sr-only">
        Removing a row returns its films to the pool; nothing is deleted.
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Mount them in the board**

In `src/ui/board/BoardScreen.tsx`, import `TierRowControls` and pass it as `TierRow`'s child, replacing the bare `<TierRow ... />` with:

```tsx
            <TierRow
              key={tier.id}
              tier={tier}
              films={(board.placements[tier.id] ?? [])
                .map((id) => byId.get(id))
                .filter((film): film is Film => film !== undefined)}
            >
              <TierRowControls
                tier={tier}
                index={index}
                tierCount={board.tiers.length}
                dispatch={dispatch}
              />
            </TierRow>
```

and change the map to `board.tiers.map((tier, index) => ( ... ))`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ui/board/`
Expected: PASS — the controls' own file plus the earlier board files, unchanged.

- [ ] **Step 6: Mutation-check**

1. Replace the `<select>` with `<input type="color">`. Expected: **"offers exactly the theme's tier colours and no free-form input"** goes red on the option list, and `npm run lint` may not catch the literal because the value is user-supplied — which is exactly why the test exists rather than relying on lint.
2. Remove `disabled={tierCount === 1}`. Expected: **"cannot remove the only remaining row"** goes red.

- [ ] **Step 7: Full suite, typecheck, lint**

Run: `npm run test:run && npm run typecheck && npm run lint`

- [ ] **Step 8: Commit**

```bash
git add src/ui/board/TierRowControls.tsx src/ui/board/BoardScreen.tsx tests/ui/board/TierRowControls.test.tsx
git commit -m "feat(ui): rename, recolour, add, remove and reorder a row"
```

---

### Task 11: Wire the board into the app

**Files:**

- Create: `src/ui/ResetConfirm.tsx`
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/App.test.tsx` (extend)
- Test: `tests/ui/ResetConfirm.test.tsx`

**Interfaces:**

- Consumes: everything above, plus `saveBoard`, `loadFirstBoard`, `clearBoards`.
- Produces: nothing further tasks depend on. Task 12 verifies it by hand.

**`App.tsx` is already 259 lines with nine state pieces, and two reviewers judged it should not be restructured yet.** This task adds a board, its history, its persistence and a search string. Keep the additions tight, and if the file becomes genuinely hard to follow, report `DONE_WITH_CONCERNS` rather than restructuring it unasked — the seam previously identified is the pair of persistence effects, not the render tree.

- [ ] **Step 1: Write the failing confirmation test**

Create `tests/ui/ResetConfirm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetConfirm } from '@/ui/ResetConfirm';

function renderConfirm(overrides: Partial<Parameters<typeof ResetConfirm>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ResetConfirm filmCount={800} boardName="My ranking" placedCount={120} onConfirm={onConfirm} onCancel={onCancel} {...overrides} />,
  );
  return { onConfirm, onCancel };
}

describe('ResetConfirm', () => {
  it('names everything that will be destroyed, with numbers', () => {
    // A generic "are you sure?" is what lets someone delete hours of ranking
    // by reflex. The counts are the whole point of this component.
    renderConfirm();
    expect(screen.getByRole('dialog')).toHaveTextContent('800 films');
    expect(screen.getByRole('dialog')).toHaveTextContent('My ranking');
    expect(screen.getByRole('dialog')).toHaveTextContent('120 placed');
  });

  it('does nothing until the destructive action is chosen', async () => {
    const { onConfirm, onCancel } = renderConfirm();
    await userEvent.click(screen.getByRole('button', { name: /keep everything/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms on the destructive action', async () => {
    const { onConfirm } = renderConfirm();
    await userEvent.click(screen.getByRole('button', { name: /delete everything/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('does not mention a board when there is none', () => {
    renderConfirm({ boardName: null, placedCount: 0 });
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/placed/i);
  });
});
```

- [ ] **Step 2: Write the confirmation**

Create `src/ui/ResetConfirm.tsx`:

```tsx
interface ResetConfirmProps {
  filmCount: number;
  boardName: string | null;
  placedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "Start over" claims to start over, so it takes the boards with it. That makes
 * it the most destructive control in the app, and a generic "are you sure?" is
 * what lets someone answer it by reflex. This one names the numbers.
 */
export function ResetConfirm({
  filmCount,
  boardName,
  placedCount,
  onConfirm,
  onCancel,
}: ResetConfirmProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start over"
      className="space-y-3 rounded-card border border-line p-4"
    >
      <p className="text-ink">This deletes, from this browser:</p>
      <ul className="list-disc space-y-1 pl-6 text-sm text-ink-dim">
        <li>{`your library of ${String(filmCount)} films`}</li>
        <li>your saved filters</li>
        {boardName !== null && (
          <li>{`your board “${boardName}”, with ${String(placedCount)} placed films`}</li>
        )}
      </ul>
      <p className="text-sm text-ink-dim">Nothing here can be recovered afterwards.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-card border border-line px-3 py-2 text-sm text-ink focus:ring-2 focus:ring-accent"
        >
          Keep everything
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent"
        >
          Delete everything and start over
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Hold the board in `App`**

In `src/ui/App.tsx`, add the imports:

```ts
import { boardReducer, type BoardAction } from '@/domain/board';
import { createBoard, poolFor, type TierBoard } from '@/domain/tiers';
import {
  initHistory,
  record,
  undo,
  redo,
  canUndo,
  canRedo,
  type History,
} from '@/domain/history';
import { saveBoard, loadFirstBoard, clearBoards } from '@/services/boards';
import { BoardScreen } from './board/BoardScreen';
import { PrefillPanel } from './board/PrefillPanel';
import { ResetConfirm } from './ResetConfirm';
```

Add the state, after `railOpen`:

```ts
  const [history, setHistory] = useState<History<TierBoard>>(() =>
    initHistory(createBoard('board-1', 'My ranking')),
  );
  const [poolSearch, setPoolSearch] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const boardValue = history.present;

  const dispatch = useCallback((action: BoardAction) => {
    setHistory((current) => {
      const next = boardReducer(current.present, action);
      // An action that changed nothing must not become an undo step, or the
      // next Ctrl+Z appears to do nothing at all.
      return next === current.present ? current : record(current, next);
    });
  }, []);
```

- [ ] **Step 4: Restore and persist it**

Add a restore effect beside the two that already exist, guarded the same way:

```ts
  useEffect(() => {
    loadFirstBoard()
      .then((restored) => {
        if (restored && !restoreCancelled.current) setHistory(initHistory(restored));
      })
      .catch((error: unknown) => {
        console.error('Failed to restore the saved board', error);
      });
  }, []);
```

And a debounced save:

```ts
  useEffect(() => {
    // Dragging produces a burst of moves; one transaction per frame of that
    // burst would be pointless work.
    const id = setTimeout(() => {
      saveBoard(boardValue).catch((error: unknown) => {
        console.error('Failed to save the board', error);
      });
    }, 400);
    return () => {
      clearTimeout(id);
    };
  }, [boardValue]);
```

- [ ] **Step 5: Undo from the keyboard**

```ts
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      // A text field owns its own undo stack; stealing Ctrl+Z from a row's
      // label input would be worse than not offering it.
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select')) return;
      event.preventDefault();
      setHistory((current) => (event.shiftKey ? redo(current) : undo(current)));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
```

- [ ] **Step 6: Render it**

Replace the `filtered ? <NoResults .../> : <FilmGrid .../>` block with:

```tsx
              {filtered ? (
                <NoResults films={films} criteria={criteria} onChange={updateCriteria} />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setHistory(undo);
                      }}
                      disabled={!canUndo(history)}
                      className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent disabled:opacity-40"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistory(redo);
                      }}
                      disabled={!canRedo(history)}
                      className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent disabled:opacity-40"
                    >
                      Redo
                    </button>
                  </div>

                  <PrefillPanel board={boardValue} films={films} dispatch={dispatch} />

                  <BoardScreen
                    board={boardValue}
                    films={films}
                    poolFilms={poolFilms}
                    search={poolSearch}
                    onSearchChange={setPoolSearch}
                    dispatch={dispatch}
                  />
                </div>
              )}
```

with `poolFilms` computed above, beside `visible`:

```ts
  const poolFilms = useMemo(() => {
    const pooled = poolFor(boardValue, visible);
    const needle = poolSearch.trim().toLowerCase();
    return needle === ''
      ? pooled
      : pooled.filter((film) => film.title.toLowerCase().includes(needle));
  }, [boardValue, visible, poolSearch]);
```

**Note the composition: `poolFor(board, visible)`, not `poolFor(board, films)`.** The rail filters the pool and only the pool — that is the spec's first decision — so the pool is the *filtered* library minus what is placed, while the rows keep rendering everything they hold.

- [ ] **Step 7: Route reset through the confirmation**

Rename the existing `reset` to `performReset`, leave its body as it is, and add `clearBoards()` to it beside `clearLibrary()` and `clearFilters()`, plus `setHistory(initHistory(createBoard('board-1', 'My ranking')))` and `setPoolSearch('')`. Then pass `onReset={() => { setConfirmingReset(true); }}` to `LibraryHeader`, and render the dialog when `confirmingReset` is true:

```tsx
          {confirmingReset && (
            <ResetConfirm
              filmCount={films.length}
              boardName={boardValue.name}
              placedCount={Object.values(boardValue.placements).flat().length}
              onConfirm={() => {
                setConfirmingReset(false);
                performReset();
              }}
              onCancel={() => {
                setConfirmingReset(false);
              }}
            />
          )}
```

- [ ] **Step 8: Extend the App tests**

Add to `tests/ui/App.test.tsx` (mocking `@/services/boards` alongside the existing service mocks):

```tsx
  it('restores a saved board and shows its placements', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);
    vi.mocked(loadFirstBoard).mockResolvedValue(
      moveFilm(createBoard('board-1', 'Mine'), 'a', { tierId: 'S', index: 0 }),
    );

    render(<App />);

    const row = await screen.findByRole('list', { name: /^S — 1 film$/ });
    expect(row).toHaveTextContent('Heat');
  });

  it('does not offer undo before anything has been done', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('asks before starting over, and names the board', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /import a different export/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('My ranking');
    expect(clearBoards).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /delete everything/i }));
    await waitFor(() => {
      expect(clearBoards).toHaveBeenCalled();
    });
  });

  it('filters the pool without emptying the rows', async () => {
    // The spec's first decision, end to end: a criterion that excludes a
    // placed film must not remove it from its row.
    vi.mocked(loadLibrary).mockResolvedValue([
      film('a', { title: 'Kept', rating: 90 }),
      film('b', { title: 'Cut', rating: 10 }),
    ]);
    vi.mocked(loadFirstBoard).mockResolvedValue(
      moveFilm(createBoard('board-1', 'Mine'), 'b', { tierId: 'S', index: 0 }),
    );
    vi.mocked(loadFilters).mockResolvedValue({ minRating: 50 });

    render(<App />);

    const row = await screen.findByRole('list', { name: /^S — 1 film$/ });
    expect(row).toHaveTextContent('Cut');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Pool' })).toHaveTextContent('1 film to place');
    });
  });
```

- [ ] **Step 9: Mutation-check**

1. Change `poolFor(boardValue, visible)` to `poolFor(boardValue, films)`. Expected: **"filters the pool without emptying the rows"** goes red on the pool count.
2. Make `dispatch` always `record` even when the board is unchanged, then add a test asserting Undo stays disabled after a no-op drop — or, if that is awkward to trigger, note in the report that this guard is covered only by `dropTarget`'s null cases and say so plainly.
3. Remove `clearBoards()` from `performReset`. Expected: **"asks before starting over, and names the board"** goes red.

- [ ] **Step 10: Full suite, typecheck, lint, build**

Run: `npm run test:run && npm run typecheck && npm run lint && npm run build`

- [ ] **Step 11: Commit**

```bash
git add src/ui/App.tsx src/ui/ResetConfirm.tsx tests/ui/App.test.tsx tests/ui/ResetConfirm.test.tsx
git commit -m "feat(ui): rank the library on a board that survives a visit"
```

---

### Task 12: See it work, then say what shipped

**Files:**

- Modify: `README.md`, `CHANGELOG.md`, `docs/superpowers/backlog.md`

- [ ] **Step 1: Run everything once more**

```bash
npm run test:run && npm run test:coverage && npm run typecheck && npm run lint && npm run build
```

Expected: green, coverage at or above 90/85/90/90.

- [ ] **Step 2: Use it, in both themes and at two widths**

`npm run dev`, import a real export, and check:

- pre-filling from ratings lands films where the thresholds say, and the counts shown beforehand matched what happened;
- dragging a poster from the **far end of a long pool** into a row — scroll the pool most of the way down first. This is the case the spec named as most likely to break, because virtualisation unmounts what scrolls out of view;
- dragging between two rows, and back to the pool;
- undo after each of those, then redo;
- renaming, recolouring, adding, removing and reordering a row;
- a reload restoring the board along with the library and the filters;
- the same again in the neon theme, and below the `lg` breakpoint.

- [ ] **Step 3: Rank something entirely by keyboard**

Tab to a card, space to lift, arrows to move, space to drop. Do it for at least three films, including one into an empty row and one back to the pool. **This is the step that cannot be delegated to the suite** — dnd-kit's keyboard sensor reads `getBoundingClientRect`, which jsdom reports as zeros, so an automated test of it either does not exist or does not prove anything.

Listen to what is announced, with a screen reader if one is available. If the announcements are wrong or absent, that is a finding, not a polish item: the spec makes keyboard operation a first-class path.

- [ ] **Step 4: Update the README**

Change the status line — the board no longer "lands next", it works — and describe ranking in the feature list beside importing, browsing and filtering.

- [ ] **Step 5: Update the CHANGELOG**

Under `## [Unreleased]` / `### Added`:

```markdown
- A tier board: rows of ranked films, drag and drop with full keyboard
  operation, undo and redo, and a pool built from the filtered library.
- Pre-filling the board from imported ratings, with editable thresholds and a
  count of what each one would place shown before it happens.
- Rows can be renamed, recoloured, added, removed and reordered. Removing a row
  returns its films to the pool rather than deleting them.
- The board is remembered between visits, in the browser.
```

- [ ] **Step 6: Update the backlog**

Add what this plan deferred:

- **Named boards** — create, rename, delete and switch between several. Plan B of the same spec.
- **PNG export and the JSON envelope** — the third plan.
- **Rows are not virtualised.** A row holding several hundred films renders every card. Deliberate: virtualising inside a row interacts badly with drag and drop, and no measurement yet says it is needed.
- **The undo history is not persisted**, so a reload starts a fresh one. Deliberate: undo that survives a reload changes something the user has no memory of doing.
- Anything Step 2 or Step 3 turned up that is not worth fixing now, with the reason.

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md docs/superpowers/backlog.md
git commit -m "docs: record the tier board and what it deferred"
```

---

## Self-review

Run after the plan is written, before execution.

**Spec coverage.** Every section of `2026-08-23-cinetier-tier-board-design.md` maps to a task: §1 the data structure → Task 1; §2 the reducer and undo → Tasks 2 and 3; §3 the screen and the pool search → Tasks 7 and 8; §4 drag, keyboard and announcements → Tasks 5, 6 and 8, with the keyboard path honestly split between an attempted test and Task 12's manual step; §5 pre-filling → Task 9; §6 tier rows → Task 10; §8 persistence and "start over" → Tasks 4 and 11; §9's failure modes → Task 1 (missing films), Task 2 (removed tiers), Task 4 (blocked IndexedDB, inherited from the shipped handler), Task 8 (interrupted drag); §10's verification list → the tests named in each task plus Task 12.

**§7, named boards, is deliberately unmapped.** It is Plan B of the same spec. The data model it needs — `id` and `name` on every board, a store keyed by id, `loadFirstBoard` as the thing a remembered id will later replace — is built in Tasks 1 and 4 so that Plan B adds a screen rather than a migration.

**Known gap, stated rather than hidden.** No automated test proves the keyboard path end to end. Task 8 Step 9 requires a genuine attempt and forbids shipping a test that passes without proving anything; Task 12 Step 3 makes it a manual gate. This mirrors how this project already handles the responsive layout, which its own automated browser cannot reach.
