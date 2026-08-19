# Cinetier filter rail — design

**Date:** 2026-08-19
**Status:** approved, awaiting implementation plan
**Extends** `2026-08-18-cinetier-design.md` (data, parsing, privacy) and
`2026-08-19-cinetier-visual-identity-design.md` (tokens, themes, typography).

## Why this exists, and why it is only a third of what was planned

"Plan 3" was going to carry the filter rail, the tier board with drag and drop,
and PNG export. That is three independent subsystems and would have run past
fifteen tasks with nothing usable until the end. It is split into three plans
instead, each of which ships something that works on its own:

1. **This one — filtering.** Slice the library along every axis the domain
   already understands, and fill in the metadata Letterboxd exports lack.
2. **The board.** Tiers, drag and drop, keyboard operation, auto-fill from
   ratings, and the empty board.
3. **Keeping and sharing.** Named boards that survive a visit, PNG export, and
   whatever of the JSON envelope still earns its place.

Filtering comes first because the board is built on a selection, and because the
domain's filtering rules are already written and tested — this plan is mostly
about giving them a face.

## Scope

**In:** the filter rail and its state, persistence of the active criteria, the
second enrichment pass that fetches genres, directors and runtimes for records
that lack them, the result count and active-criteria chips, and the zero-result
screen.

**Out:** the tier board, drag and drop, PNG export, named boards, JSON
export/import. A criterion set is not "sent" anywhere yet; the rail filters the
library view and nothing else.

## Decisions taken

| Question | Decision |
| --- | --- |
| Split | Three plans; this is the first |
| Missing metadata | Fetched in the background after posters, not at import and not on demand |
| How many criteria surface | All eleven, grouped in collapsible sections |
| Filter state across visits | Kept locally, restored on return, with a clear-all action |
| Where the state lives | `App`, with a controlled rail — no context, since nothing else reads it |

## 1. The criteria and where they live

`FilterCriteria` in `src/domain/filters.ts` already exists, is exercised by
tests, and needs no new axis:

`titleTypes`, `minRating`, `maxRating`, `onlyUnrated`, `watchedAfter`,
`watchedBefore`, `genres`, `directors`, `decades`, `minRuntimeMinutes`,
`maxRuntimeMinutes`, `onlyRewatches`, `minRatingDelta`, `maxRatingDelta`,
`topN`.

`App` holds the current criteria in state and passes them, with a setter, to a
controlled `FilterRail`. A React context would add an indirection for a single
consumer; the rail is the only thing that reads or writes them, and `App`
already orchestrates import, enrichment and persistence.

**Persistence.** A new `src/services/filters.ts` writes the criteria to
IndexedDB beside the library and reads them back at startup. Two rules it must
respect, both learned from the library store:

- `watchedAfter` and `watchedBefore` are `Date` objects. A naïve round trip
  returns strings that pass `typeof` checks and then fail at `getTime()`. The
  store revives them explicitly, and a test asserts they come back as `Date`.
- An empty criteria object restores as "no filter", never as a filtered view
  that happens to admit everything — the same reasoning that made an empty
  saved library restore as no library.

Restoring criteria must not resurrect a filter the library can no longer
satisfy: genres and directors are restored as given, and any value that matches
nothing simply admits nothing, which the zero-result screen then explains. The
rail does not silently drop criteria it cannot offer, because silently changing
what the user asked for is worse than showing them an empty result they can
undo.

## 2. The rail

A column to the left of the poster grid, collapsible in full on narrow screens,
where it becomes a sheet opened from a button rather than a permanent column.

Sections, in order, with the first three open and the rest collapsed:

| Section | Controls |
| --- | --- |
| Rating | minimum, maximum, only unrated, rating delta against the public score |
| Era | decades present in the library, and a year range |
| Type | film, TV film, series, mini-series, episode, short, other |
| Genre | multi-select, only the genres the library actually holds |
| Director | multi-select, searchable — a large library has hundreds |
| Runtime | minimum and maximum minutes |
| Watched | after, before, only rewatches |
| Top N | keep the highest-rated N, applied last |

Each section header carries the number of films that section's criteria admit,
so the reader can see which one is doing the cutting.

Above the grid: a count — "143 of 400 films" — and the active criteria as chips,
each removable on its own, plus a clear-all action that appears only when
something is active.

Every option offered comes from the library: `availableGenres`,
`availableDirectors` and `availableTitleTypes` exist; this plan adds
`availableDecades`, and bounds helpers for year and runtime. A control must
never offer a value that no film carries — an empty result the reader chose is
fair, one the interface handed them is not.

## 3. The metadata Letterboxd does not export

Letterboxd records arrive with no genres, no directors and no runtime, because
neither TMDB's `find` nor its `search` endpoint returns them. Without a second
request per film, three of the eight sections would quietly offer less to
Letterboxd users than to IMDb ones — which reads as a broken product rather than
a limitation of someone else's export.

**A second enrichment pass** runs after the poster pass, in the background, over
records that have a `tmdbId` but no details yet. It reuses the existing
worker-pool concurrency and the TTL cache rather than inventing new ones.

The endpoint depends on what the title is. TMDB files films and television
separately and the two are not interchangeable:

- a film: `/movie/{id}?append_to_response=credits` — genres, runtime, and the
  crew entries whose job is Director.
- a series or mini-series: `/tv/{id}` — genres, episode runtime, and
  `created_by`, which is the closest true equivalent to a director and is what
  the interface will show under that heading.

**A model addition.** Today an empty `genres` array means two different things:
nobody has asked TMDB yet, or TMDB was asked and the film genuinely has none.
The rail cannot tell the truth without separating them, so `Film` gains
`detailsFetched: boolean`. Deduplication merges it with a logical OR — if either
record was enriched, the merged film is. Both parsers set it to `false`; only
the details pass sets it to `true`, and it does so even when the response was
empty, because "asked and got nothing" is a real answer.

**While it runs,** the Genre, Director and Runtime sections are disabled and say
why, with the count of what remains. They enable themselves as soon as every
record that can be enriched has been. A record whose lookup failed does not
block them forever — the pass finishes, and the affected films simply carry no
genres, which the sections' option lists reflect honestly.

## 4. When nothing passes

Zero results is the most common state of an eleven-axis rail, and an empty grid
with no explanation is the failure this project already shipped once, in a
different form, when an import produced no films.

The zero-result screen names the criterion most responsible — the one whose
removal would admit the most films — and offers to remove it, alongside the
clear-all action. Computing that is a pure function over the library and the
criteria, so it lives in `domain/filters.ts` with the rest and is tested there.

## 5. Accessibility

- Each section is a `fieldset` with a `legend`, reachable and operable by
  keyboard, with a visible focus ring drawn from the accent token.
- The result count sits in an `aria-live="polite"` region. Without it, a screen
  reader user changes a control and is told nothing about what happened.
- The collapsible sections use real `<details>`/`<summary>` semantics or an
  equivalent button with `aria-expanded`, not a div that only looks clickable.
- Chips are buttons with an accessible name that says what removing them does,
  not a bare "×".

## 6. Verification

The domain's filtering rules are already covered. What this plan must prove:

- Criteria survive a reload, and the two dates come back as `Date`.
- Blocked or unavailable storage loses the criteria without breaking the page.
- The metadata sections are disabled while the details pass runs and enable when
  it finishes, including when some lookups failed.
- A removed chip removes exactly its own criterion and no other.
- The option lists never offer a value the library does not contain.
- The zero-result screen names a criterion whose removal genuinely admits more
  films — verified against a fixture where the answer is known.
- Both TMDB detail endpoints are exercised, including a series, because using
  the film endpoint for a series returns nothing and would be invisible without
  a test.

By hand, and shown rather than described: the rail in both themes, at desktop
and at phone width, with a library large enough that filtering matters.

## Risks

- **Doubling the request count.** A Letterboxd-only library of 800 films makes
  800 poster lookups and then 800 detail lookups. The pass runs in the
  background and the cache is shared, but the plan measures how long it takes
  on a realistic library rather than assuming it is fine.
- **`created_by` is not a director.** For series it is the honest available
  answer, and the interface says "director" for both. If that reads wrong once
  it is on screen, the label is the thing to change, not the data.
- **An eleven-section rail can overwhelm.** The collapsed default and the
  per-section counts are the mitigation; if the rail still feels heavy once it
  is real, the next plan can promote a few criteria and demote the rest.
