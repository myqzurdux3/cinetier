# Cinetier tier board — design

**Date:** 2026-08-23
**Status:** written, awaiting review
**Extends** `2026-08-18-cinetier-design.md` (data, parsing, privacy),
`2026-08-19-cinetier-visual-identity-design.md` (tokens, themes, typography),
and `2026-08-19-cinetier-filter-rail-design.md` (the rail this board sits beside).

## Why this exists

The app is called Cinetier and its landing page promises a tier list. It cannot
make one. Importing, browsing and filtering all work; the ranking the whole
product is named after does not exist. This spec covers it.

The old "Plan 3" was split into three. The first shipped on 2026-08-20 — the
filter rail and the second TMDB enrichment pass. This is the second, and it now
absorbs the named boards that the split had put in the third, because the data
model cannot be designed honestly without them: deciding what a board is while
pretending only one can exist produces a shape that has to be torn up the moment
a second one does.

What stays for later: PNG export, the JSON export/import envelope.

## Scope

**In:** the board and its rows, drag and drop with full keyboard operation,
undo and redo, pre-filling from imported ratings on demand, the pool built from
the filtered library, a title search in the pool, named boards with create,
rename, delete and switch, and persistence of all of it.

**Out:** PNG export, JSON export/import, sharing a board by link, per-tier
statistics, and a poster-size control. The first two are the next plan; the rest
are backlog.

**Executed as two plans, from this one spec.** Plan A is the board itself,
usable and deployable on its own with a single implicit board. Plan B adds named
boards on top. The data model below is designed for B from the start so that A
does not have to be undone; A simply never surfaces more than one board.

## Decisions taken

| Question | Decision |
| --- | --- |
| Filter versus board | The rail filters the pool only; tiers always show everything placed in them |
| A new board | Starts empty — everything in the pool. Pre-filling from ratings is an action, not a default |
| Screen layout | One screen, three regions: rail left, board upper right, pool lower right |
| Where board state lives | A pure reducer in `domain/`, held by one `useReducer` in `App` |
| Undo | Bounded history of whole board states, with redo; the reducer makes it nearly free |
| The pool | Derived, never stored — the library minus everything placed |
| Start over | Deletes boards too, behind a confirmation that names what is lost |
| Tier colours | Chosen from the theme's tier tokens, never free-form colour values |
| Board scale | One board in plan A, named boards in plan B, one data model for both |

## 1. What a board is

`src/domain/tiers.ts` already defines `Tier`, `DEFAULT_TIERS`, `TierBoard`,
`createEmptyBoard`, `autoFillBoard` and `moveFilm`, all pure and tested. This
spec keeps that vocabulary and changes one thing about it.

**The pool becomes derived rather than stored.** Today `TierBoard` carries both
`placements` and `pool`, which are two sources of truth for the same fact: a
film is unplaced exactly when no tier holds it. Two sources of truth for one
fact is where desynchronisation bugs come from, and this design would multiply
the chances: the library changes under a board on every re-import, and a stored
pool would have to be reconciled each time by code that exists only to keep a
redundant field honest.

Derived, that reconciliation disappears. A re-import that adds films makes them
appear in every board's pool with no code at all. A re-import that drops a film
leaves a placement pointing at nothing, which the render skips — and if a later
import brings that film back, its place comes back with it, because the
placement was never deleted. That is the behaviour the product spec asked for
when it said boards store references rather than copies.

The cost is that a film's position *within* the pool is no longer expressible,
so `moveFilm`'s pool-index argument loses its meaning. That is an acceptable
loss: the pool is a bag you pick from, ordered by the library's own order and
narrowed by the rail, not a ranking. Dropping a film "back to the pool" returns
it to the bag; it does not place it at a position in it.

So:

```ts
interface TierBoard {
  id: string;
  name: string;
  tiers: Tier[];
  /** Tier id -> ordered film ids. A film absent from every list is in the pool. */
  placements: Record<string, string[]>;
}
```

`id` and `name` exist from plan A even though plan A shows one board, because
adding an identity to a persisted record later means migrating every record that
was written without one.

## 2. The reducer, and why the state is shaped this way

Ranking is hundreds of small mutations, some of them mistakes. A poster dropped
into the wrong row halfway through a session is unrecoverable by any means
except finding it again by hand, and the user has no reason to expect that —
every other application they use undoes.

`src/domain/board.ts` holds a pure reducer over `TierBoard`:

```ts
type BoardAction =
  | { type: 'move'; filmId: string; to: { tierId: string; index: number } | 'pool' }
  | { type: 'prefill'; films: Film[] }
  | { type: 'clearToPool' }
  | { type: 'addTier'; afterTierId: string | null }
  | { type: 'removeTier'; tierId: string }
  | { type: 'moveTier'; tierId: string; toIndex: number }
  | { type: 'renameTier'; tierId: string; label: string }
  | { type: 'recolorTier'; tierId: string; color: TierColor }
  // TierColor is a union of the theme's tier token names, not a colour value —
  // see section 6. The domain names the token; the UI resolves it.
  | { type: 'setThreshold'; tierId: string; minRating: number | null }
  | { type: 'renameBoard'; name: string };
```

`removeTier` returns that row's films to the pool rather than deleting them —
the only destructive board action is deleting a board, and that one asks.

Undo wraps the reducer rather than living inside it: `App` holds
`{ past: TierBoard[]; present: TierBoard; future: TierBoard[] }`, capped at 50
past states. Whole snapshots rather than inverse actions, because a board is a
small object of string arrays and inverse actions are where undo implementations
go wrong.

**Undo and autosave interact, and the resolution is worth stating.** Every
action writes the new present to IndexedDB, and undo is an action like any
other: it writes too. Undo therefore means "return the board to its previous
state", not "roll back the last save". After undo, the stored board matches what
is on screen. There is no separate saved-versus-live distinction anywhere in the
app, and introducing one here would be the only place it existed.

`past` and `future` are deliberately not persisted. Undo history that survives a
reload sets up the worst possible surprise — pressing undo and having something
change that you have no memory of doing.

## 3. The screen

Three regions, which is what the product spec described from the start:

```
┌──────┬────────────────────────────┐
│      │  S  [img][img][img]        │
│ RAIL │  A  [img][img]             │
│      │  B  [img][img][img][img]   │
│      │  C                         │
│      │  D  [img]                  │
│      │  F                         │
│      ├────────────────────────────┤
│      │ POOL — 42 of 800 titles    │
│      │ [img][img][img][img][img]  │
│      │ [img][img][img][img][img]  │
└──────┴────────────────────────────┘
```

The pool is the grid that ships today. `FilmGrid` already virtualises hundreds
of posters and already measures its own column count; it becomes the pool
unchanged in behaviour, gaining only the ability to be a drag source. The board
replaces the grid's former position at the top of the column.

The pool carries a title search of its own, because the rail has no free-text
axis and "where is Heat" is the one question filtering by genre and decade
cannot answer. It narrows the pool alongside the rail's criteria rather than
replacing them, and it is pool-local state: it is not a criterion, it is not
persisted, and it does not appear as a chip.

Rows wrap and grow with their contents rather than scrolling internally. A row
holding two hundred films will be tall, and that is honest — a tier list is a
document you scroll. Virtualising inside rows is deliberately not done: it
interacts badly with drag and drop, and no measurement yet says it is needed.

Below the `lg` breakpoint the rail is already a button that opens a panel. The
board and pool stack in the same column, board first.

## 4. Drag and drop, and the keyboard

`dnd-kit`, as the product spec chose, because its `KeyboardSensor` gives
keyboard operation as a first-class path rather than an afterthought: focus a
card, space to lift, arrows to move between rows and positions, space to drop,
escape to cancel. A tier list that only works with a mouse is not finished.

Every lift, move, drop and cancel is announced through dnd-kit's screen-reader
instructions, worded for this domain — "Heat lifted from the pool", "Heat moved
to tier A, position 3 of 7", not the library's defaults.

**The known risk, named because it is the thing most likely to go wrong.** The
pool is virtualised, and virtualisation unmounts what scrolls out of view. A
drag that starts in the pool and travels to a row can outlive its own source
element. This combination is a well-known source of dropped drags and jumping
overlays. The implementation plan must treat "drag a poster from the far end of
an 800-film pool into a tier" as a first-class case with its own test, not as an
edge case discovered later.

## 5. Pre-filling from ratings

A new board starts empty. Pre-filling is a button, and it opens a small panel
rather than acting immediately, because the thresholds are part of the decision:
S at 90, A at 80, B at 70, C at 60, D at 50, F for the rest — editable there,
with the count each threshold would place shown beside it, so the effect is
visible before it happens.

The same panel is the only place thresholds are edited. There is no separate
settings dialog for them; a threshold that never gets used to pre-fill has no
other effect on anything.

Pre-filling only ever moves films **from the pool**. It never rearranges what is
already placed by hand, and it is a single undoable action. Unrated films stay
in the pool, since a rating is what the pre-fill sorts by.

"Send everything back to the pool" is the inverse, and equally undoable.

## 6. Tier rows

Rows can be renamed, recoloured, added, removed and reordered. The defaults are
the six the domain already ships.

**Colours come from the theme, not from a colour picker.** The visual identity
plan established that no colour literal may appear in `src/ui/**`, and the tier
palette is the one saturated element on an otherwise near-black screen — a
free-form picker would let a user destroy the contrast the design depends on,
and would break the rule in the process. Recolouring picks from the tier tokens
already defined in `src/index.css`.

Renaming a row is a text input with a sensible cap; the row label is a heading,
not a paragraph.

## 7. Named boards (plan B)

A board list: create, rename, delete, switch. Deleting asks, because a board is
hours of work and nothing else in the app destroys that much on one click.

Creating offers to pre-fill immediately, as a convenience at the one moment the
question is unavoidable anyway. Empty stays the default — the offer is a second
button beside it, not a prompt that must be answered.

The current board's id is remembered between visits, alongside the criteria that
are already remembered.

## 8. Persistence

IndexedDB schema goes to version 3, adding one store:

- `boards` — keyed by board id, holding `TierBoard` records.

The upgrade follows the pattern that shipped and was tested at version 2:
create what is missing, never branch on the arriving version, so the next bump
does not have to know where each visitor came from.

Writes are debounced. Dragging produces a burst of moves and each one must not
be its own transaction.

**"Start over" deletes boards too**, since it claims to start over and a button
that leaves data behind is worse than one that does not. Its confirmation names
what will go — the library, the filters, and the boards by name and count —
rather than asking a generic "are you sure".

## 9. What can go wrong, and what happens

- **A placement points at a film the library no longer has.** Skipped when
  rendering, kept in storage. A later import that restores the film restores its
  place.
- **A board references a tier that was removed.** Cannot happen: removing a tier
  moves its films to the pool in the same action.
- **IndexedDB is unavailable or blocked.** The board works in memory for the
  session and says so once, following the handling added at version 2. It does
  not pretend to save.
- **A drag is interrupted** by a scroll, an unmount or an escape: the board is
  unchanged, because the reducer only sees a completed drop.

## 10. Verification

The domain's tier rules are partly written and tested already. What these plans
must prove:

- Pre-filling places every rated film in the tier its threshold selects, and
  leaves unrated films in the pool — against a fixture where the answer is known
  by hand.
- Undo returns the exact previous board, redo returns the undone one, and a new
  action after an undo discards the future rather than branching it.
- The pool is exactly the library minus every placed film, including after a
  re-import that both adds and removes films.
- A film dragged from a virtualised pool position that is scrolled out of view
  during the drag still lands where it was dropped.
- The whole board is operable from the keyboard alone: lift, move across rows,
  drop, cancel — asserted through the keyboard sensor, not simulated by calling
  the reducer.
- Removing a tier returns its films to the pool rather than losing them.
- A board survives a reload, and the version-2-to-3 upgrade keeps existing
  libraries, filters and caches intact.
- "Start over" removes boards, and its confirmation names them first.

By hand, and shown rather than described: a board built from a real library in
both themes, at desktop and at phone width, ranked entirely by keyboard once and
entirely by mouse once.
