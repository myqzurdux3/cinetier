# Backlog

Items deliberately carried out of the foundations and import plans. Each was found during
review, judged, and deferred with a reason — none is an oversight. Ordered by how much it
should influence the next plan's design rather than by size.

## Changes a design decision

### Letterboxd export may require a paid subscription

`ImportGuide` hedges: "If you do not see an export option in your settings, Letterboxd may
require a Pro subscription for it." That wording is deliberate. Whether free accounts can
export could not be established — Letterboxd's own help pages refuse automated fetches, and
the available secondary sources disagree with each other and with the export URL
`letterboxd.com/settings/data/`.

A human with a free Letterboxd account settles this in under a minute. Until then, do not
harden the sentence in either direction: asserting a paywall turns away most users of one of
the two supported services if it is wrong, and denying one sends them into a dead end if it
is right. `tests/ui/ImportGuide.test.tsx` pins the conditional phrasing, so hardening it
fails the suite on purpose.

### Two different films can share a TMDB identifier

`searchByTitle` resolves a Letterboxd record by title and year. A fuzzy match can return the
wrong film, and since deduplication treats a TMDB id as an identity, two genuinely different
films that both resolve to it merge unconditionally — losing one film's rating from the
library, permanently, because the merged result is then persisted.

Exposure is small: the year is sent whenever the export supplies one, and Letterboxd's
catalogue is TMDB-derived, so the realistic exposure is records with no year.

Worth considering in the next plan: record match provenance — an exact `find` by IMDb id
versus a fuzzy `search` — and union only on identifiers that came from an exact match.

### Letterboxd films have no genres, directors or runtimes

TMDB's search and find endpoints return neither, so filling them needs a second request per
film. That was deferred because only the filter rail consumes them.

**The filter rail is next plan's scope, so that plan must schedule the fetch** — otherwise
genre, director and runtime filters silently offer fewer options for Letterboxd-sourced
films than for IMDb ones, which reads as a bug rather than a limitation.

### Two same-title, same-year films can still merge

If two genuinely distinct films share an exact title and release year, and a third record
links them, they collapse into one. Enrichment narrows this considerably by supplying
identifiers, but does not eliminate it. Accepted: the specification's fallback rule is
title plus year, and this is the stated cost of that rule.

## Robustness

- **A rejected enrichment leaves the progress counter on screen.** It logs, and the reset
  button is always reachable, so nobody is trapped — but the interface says it is still
  working when it has stopped.
- **A failed IndexedDB open is cached for the session.** `connection ??=` stores the
  rejected promise, so if the database cannot open — private browsing, quota, a blocked
  upgrade — every later read and write fails with no retry. Since the library now shares
  that connection, the blast radius is larger than when this was first accepted.
- **Persistence is all-or-nothing.** The library is saved only after enrichment completes,
  so closing the tab mid-enrichment loses the import. The poster cache survives, so the
  re-import is fast, but it must be repeated. Saving straight after parsing would close it.
- **The stored library carries no schema version.** `{ films, savedAt }` will be read back as
  today's `Film` shape whatever it actually holds. The specification asks for a versioned
  envelope for JSON export; the same reasoning applies to the store.
- **TMDB payloads are cast, not runtime-narrowed.** A malformed response cannot throw — it
  flows through optional chaining into nulls — but it could produce a record that violates
  its own declared type. Worst case today is a broken image.
- **`imdbId` is interpolated into the TMDB URL path unencoded**, unlike the title.

## Performance

- **Enrichment copies the whole library per resolved film**, so a 5000-film import performs
  5000 array copies and 5000 React commits. The specification's risk table names libraries
  of that size. Batching progress — every N films, or on an animation frame — is the cheap
  fix.
- ~~**The grid is fixed at six columns** regardless of viewport, so a phone renders six very
  small posters per row.~~ Superseded, then closed: the grid briefly defaulted to a fixed 8
  columns under the visual-identity plan, and the whole-branch review fix pass (2026-08-19)
  made the column count responsive to the container's measured width instead (see the
  visual-identity entry further down).
- **zip.js cannot be code-split.** It is eagerly imported by a `parsers/` module, and the
  layer rule forbids dynamic `import()` there, so every IMDb-only visitor downloads it.

## Interface and copy

- **`LibrarySummary`'s progress is a conditionally mounted live region** — the pattern that
  was fixed in `DropZone` because screen readers frequently do not announce it. The naive
  fix is wrong here: a polite region over a per-film counter would announce hundreds of
  times. Mount it always and announce only start and finish.
- **The file input leaves the tab order while an import runs**, so keyboard focus is lost for
  the duration.
- **The screen-reader status duplicates the visible line verbatim**, so someone reading the
  region afterwards meets the same sentence twice.

## Testing and tooling

- **No test pins "the grid renders before enrichment resolves"** — the property the whole
  enrichment architecture exists to provide. It rests on manual browser checks.
  `tests/ui/App.test.tsx` already has the deferred-promise machinery to do it properly.
- **Every test file redefines the same `Film` factory** — six near-identical copies. A shared
  `tests/support/film.ts` would delete about a hundred lines.
- **No end-to-end suite exists.** The specification calls for Playwright covering
  import → filter → move a card → export → reload. No plan has scheduled it and no CI job
  runs it.
- **The README has no screenshot**, which the specification asks for and which only became
  possible once the library screen shipped.
- **CI actions target a deprecated runner.** `actions/checkout@v4` and `setup-node@v4` warn;
  a bump to `@v5` clears it.

## Closed on 2026-08-19, from a real user import

A real IMDb export exposed three defects at once, all fixed on
`fix/series-and-unrated-imports`:

- **The `Title Type` column is localized.** A French account exports `Film` and
  `Série télévisée`; the parser compared against the literal `movie`, so a
  French export imported nothing. Types are now classified across languages by
  `src/domain/titleType.ts`, and an unrecognized label is imported as `other`
  rather than dropped — failing open, because a silently emptied import is the
  worst outcome available.
- **An import that produced no film handed the next screen an empty library**,
  which reads as a broken site. `importFiles` now returns an error naming how
  many entries it had to skip.
- **Series were dropped by design.** They are now first-class and separated by
  `FilterCriteria.titleTypes`; `lookupByImdbId` reads TMDB's `tv_results`
  alongside `movie_results`, so a series gets its poster.

Also closed: IMDb list exports (no `Your Rating` column) and Letterboxd
`watched.csv` now import as unrated titles, so watch history no longer requires
a score.

~~**Still open, and now the top of the list:** the interface has no visual
identity — it is grey type on a grey ground, and the logo's colours are
invisible at 28px. The user asked for a strong identity before anything else
ships on top of it.~~ Closed by the visual-identity plan (2026-08-19): two
tested, AA-contrast palettes (salle obscure and a neon video-shop theme),
self-hosted display and text faces, a lit mark legible at header size, and a
themed landing screen and library grid.

That plan deferred three things of its own:

- ~~**The grid's column count is fixed at 8** rather than responsive to the
  container.~~ Closed by the whole-branch review fix pass (2026-08-19): the
  grid now measures its scroll container with a `ResizeObserver` and derives
  the column count as `Math.max(2, Math.floor(width / 150))`, capped at 8 —
  a phone gets two or three columns instead of eight cramped ones, a desktop
  still gets eight. The `columns` prop still exists as an explicit override
  for callers (and tests) that want a fixed count. This supersedes the older
  entry above about six columns, which predates the grid's current default.
- **Neon's `--shadow-glow` token is consumed by the theme toggle and the
  service cards.** The tier board is where it will earn its place more
  broadly.
- **The mark's geometry test parses path data with a regex** that only
  holds for the current hand-written path style. A future redraw of the
  logo, or one produced by a design tool that emits different path
  commands, can silently stop being checked by that test.
