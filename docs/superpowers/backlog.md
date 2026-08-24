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

### ~~Letterboxd films have no genres, directors or runtimes~~

~~TMDB's search and find endpoints return neither, so filling them needs a second request per
film. That was deferred because only the filter rail consumes them.~~

~~**The filter rail is next plan's scope, so that plan must schedule the fetch** — otherwise
genre, director and runtime filters silently offer fewer options for Letterboxd-sourced
films than for IMDb ones, which reads as a bug rather than a limitation.~~

Closed by the filter-rail plan (2026-08-20): a second TMDB request per film, made after
posters, fills in genres, directors and runtimes for every source. Verified by hand against
a real Letterboxd export carrying no genres at all — it came back filterable by genre, nine
of them, fetched after the posters.

### Two same-title, same-year films can still merge

If two genuinely distinct films share an exact title and release year, and a third record
links them, they collapse into one. Enrichment narrows this considerably by supplying
identifiers, but does not eliminate it. Accepted: the specification's fallback rule is
title plus year, and this is the stated cost of that rule.

### No year range, only decades

`FilterCriteria` has no `minYear`/`maxYear`, and translating a range into decades answers a
different question. A later plan can add the axis.

### Named boards are the next plan, not this one

Create, rename, delete and switch between several boards is Plan B of the same spec
(`docs/superpowers/specs/2026-08-23-cinetier-tier-board-design.md`), whose data model this
plan already built: every board carries an `id` and a `name` (`createBoard(id, name,
tiers)`), and `services/boards.ts` keys the `boards` object store by `id`. Plan B adds a
screen, not a migration.

### ~~PNG export~~, and the JSON envelope, are the plan after that

Both were the spec's third plan, named explicitly in its own "what stays for later" line.

PNG export shipped on 2026-08-24. The geometry is `src/domain/boardLayout.ts`, arithmetic
over numbers with no DOM in it; the drawing is `src/ui/board/exportPng.ts`, which paints
through an interface narrow enough for a test to hand it a recorder instead of a canvas —
jsdom has no 2D context, so the split is what makes either half testable. Colours come from
the document's custom properties, so both themes export correctly and a third would too.
Verified in a browser in both themes, with and without real posters from TMDB.

The JSON envelope — a saved board as a file you can carry to another browser — is still
unbuilt, and is now the more useful of the two, since a PNG is a picture of a ranking and
not the ranking itself.

### The undo history does not survive a reload

Deliberate: undo that persists would let a user "undo" an edit they have no memory of
making, possibly minutes or sessions later. A reload starts a fresh history; the board
itself is still exactly as it was left.

### `App.tsx` stays as it is, deliberately

At 437 lines, with eleven state pieces and five effects, `App.tsx` grew again over the
tier-board plan — it was 259 lines and nine state pieces when the filter-rail plan's two
reviewers first judged it. A third reviewer, on this plan, reached the same verdict: it
should not be restructured mid-plan. All three named the same seam — the persistence
effects and their writers, not the render tree.

## Robustness

- **The coalescing guard's StrictMode clause cannot be tested, and may be dead.** `App.tsx`'s
  history coalescing guards on `base !== current`, which exists so that React's development
  double-invocation cannot make the second pass coalesce into the entry the first pass just
  recorded. Removing that clause turns no test red. The reason was traced into React 19's own
  dispatch path: its eager-state computation means no DOM-driven interaction this app can
  produce makes the canary call's result observable. So the clause is either genuinely dead
  or it protects a path nothing here can reach — and a test for it was written, mutated,
  found unfalsifiable, and deleted rather than shipped. Worth settling deliberately: either
  prove it necessary, or remove it and say why.
- ~~**First to triage: a board edit can silently cancel a pending filters restore.**~~
  Closed on 2026-08-24 with the separate ref the entry named. `boardEdited` is set by any
  board edit and read only by the board restore; `restoreCancelled` keeps its own meaning —
  the user replaced or discarded the library — and stays shared by the library and filters
  restores. A test drives the race directly: a slow `loadFilters()`, a real board edit
  before it resolves, and the criteria still apply afterwards.
- **A rejected enrichment leaves the progress counter on screen.** It logs, and the reset
  button is always reachable, so nobody is trapped — but the interface says it is still
  working when it has stopped.
- **A failed IndexedDB open is cached for the session.** `connection ??=` stores the
  rejected promise, so if the database cannot open — private browsing, quota, a blocked
  upgrade — every later read and write fails with no retry. Since the library now shares
  that connection, the blast radius is larger than when this was first accepted.
- **`openDB` has no `blocking` callback.** `blocked` (added with the v2 schema) fires on the
  tab that is *waiting*; `blocking` fires on the tab that is *in the way*, and closing the
  connection there is what lets the other tab proceed. Adding it cannot help the v1-to-v2
  transition — the blocking tab is running the old bundle — but it is what stops the next
  version bump from reproducing this exactly.
- **A blocked upgrade still shows the user a "your library vanished" screen.** The `blocked`
  handler logs what happened and says in its own comment that it cannot unblock the hang;
  only closing the other tab can. Meanwhile `loadLibrary` never resolves, `films` stays null,
  and the import screen is what the user sees. A visible message would be the honest fix.
- **`resetDatabase`'s `deleteDB` has no `blocked` handler** and can hang exactly the way the
  upgrade could, for the same reason.
- **`String(blockedVersion)` can render "null"** in the blocked message, since `idb` types it
  `number | null`.
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
- **A failed detail lookup is cached as "TMDB had nothing"** for thirty days, the
  same rule the poster cache follows. A title that failed because the network
  dropped will not be asked about again for a month.
- **An episode with an imdbId never gets details.** `lookupByImdbId` reads
  `movie_results` and `tv_results` only, so such an episode carries no
  `tmdbId` and the pass skips it. An episode with no imdbId is matched by
  `searchByTitle` instead, can pick up a `tmdbId`, and reaches the pass after
  all — harmlessly, since `enrichDetails` falls back to the `/movie` endpoint
  for anything it doesn't recognize as television.
- **`reset()` does not reset `railOpen`**, and calls `clearFilters()` unconditionally even
  when nothing was ever saved.
- **`NoResults.tsx`'s `culprit && description` is a redundant double guard** —
  `description` is non-null exactly when `culprit` is.

## Performance

- **A drag costs about 75 microseconds per placed film, per pointer move.** Measured against
  the production build on 2026-08-24, twenty pointer moves each: 400 placed films ≈ 40ms a
  move, 1000 ≈ 75ms, 2000 ≈ 150ms. Up to a few hundred films the board is fluid; past a
  thousand a drag visibly stutters, and `Pre-fill from my ratings` on a large library is a
  one-click route to exactly that.

  The cost is not the DOM. Every card in every row is a dnd-kit context subscriber through
  `useSortable`, and dnd-kit updates that context several times per pointer move, so every
  card's hook re-runs — 85,000 component renders across twenty moves on a 1000-film board.
  Two things were tried and measured, and neither is worth its cost: memoising the card's
  rendered subtree changes the total by about 1% (the work is in the hook, not the
  elements), and dropping `horizontalListSortingStrategy` for a null strategy buys 11% at
  the price of the gap-opening animation that shows where a film will land.

  What would actually work is fewer mounted dnd-kit hooks: rows keeping their droppable
  while cards inside them become plain elements, with the insertion index computed from the
  pointer's position in the row rather than from a per-card droppable. That is a real
  redesign of `dropTarget.ts` and it costs within-row keyboard positioning, which is why it
  was not done on the way past. Virtualising rows is the other option and the spec rejected
  it for interacting badly with drag and drop.

- **Rows are not virtualised.** A row holding several hundred films renders every card.
  Deliberate: virtualising inside a row interacts badly with drag and drop, and no
  measurement yet says it is needed.
- **Enrichment copies the whole library per resolved film**, so a 5000-film import performs
  5000 array copies and 5000 React commits. The specification's risk table names libraries
  of that size. Batching progress — every N films, or on an animation frame — is the cheap
  fix.
- **The details pass doubles the request count.** Measured on a 6-film Letterboxd import — the
  largest export available for this check has 7 rows — the second pass (6 detail requests)
  took 277 ms, following 142 ms for the 6 poster lookups that precede it. At the worker pool's
  6-way concurrency that is roughly one batch, so about 277 ms per batch of six.
  Extrapolated — not measured — to the specification's 800-film case: roughly 134 batches, on
  the order of 35-40 seconds. Treat that figure as an extrapolation from six titles, not a
  measurement at scale.
- **The rail runs eight `applyFilters` passes per render, with no memoisation, and each
  `*Controls` component recomputes its option list on every keystroke.** A 5000-film library
  therefore does eight full passes per change; unmeasured at that scale, since nothing in
  this plan ran past six films. Memoizing per section is the cheap fix if it is ever felt.
- ~~**The grid is fixed at six columns** regardless of viewport, so a phone renders six very
  small posters per row.~~ Superseded, then closed: the grid briefly defaulted to a fixed 8
  columns under the visual-identity plan, and the whole-branch review fix pass (2026-08-19)
  made the column count responsive to the container's measured width instead (see the
  visual-identity entry further down).
- **zip.js cannot be code-split.** It is eagerly imported by a `parsers/` module, and the
  layer rule forbids dynamic `import()` there, so every IMDb-only visitor downloads it.

## Interface and copy

- **A row's five edit controls are always on screen, on every row.** At 1280px they fit one
  line and cost about thirty pixels a row; at 390px they wrap to three lines and a row
  becomes 185px of mostly buttons. Collapsing them behind a per-row disclosure is the
  obvious move, and the reason it was not done here is that jsdom does not hide the content
  of a closed `<details>` from `getByRole` — every existing control test would keep passing
  while clicking something a person cannot reach. Worth doing with that gap named and a
  browser check standing in for it.
- **Pre-fill reads the whole library, not the filtered view.** This is the decision the spec
  took, and it is defensible — thresholds are about ratings, not about what the rail is
  showing. What it looks like from the outside is less defensible: with a filter admitting
  3 of 10 titles, pressing the button places all 10 and the pool drops to "0 films to
  place", so seven titles the user cannot see moved without a word. The panel's summary now
  states the count it will place, which helps; naming the set it draws from would help more.

- **`LibrarySummary`'s progress is a conditionally mounted live region** — the pattern that
  was fixed in `DropZone` because screen readers frequently do not announce it. The naive
  fix is wrong here: a polite region over a per-film counter would announce hundreds of
  times. Mount it always and announce only start and finish.
- **The file input leaves the tab order while an import runs**, so keyboard focus is lost for
  the duration.
- **The screen-reader status duplicates the visible line verbatim**, so someone reading the
  region afterwards meets the same sentence twice.
- ~~**Removing a criterion unmounts the focused button.** Focus falls to `<body>`; nothing
  moves it to a stable neighbour.~~ Closed by the filter-rail branch review's fix wave
  (2026-08-20): `FilterStatus`'s wrapper carries `tabIndex={-1}` and takes focus after a
  removal, and `NoResults`'s culprit button targets that same wrapper — which is sound
  because `FilterStatus` is mounted unconditionally in both the filtered and unfiltered
  branches.
- ~~**`FilmGrid`'s entrance replays on every zero-to-non-zero filter transition.**~~
  Superseded by the tier-board plan (2026-08-23): `App` no longer renders `FilmGrid`
  directly, or unmounts it when the filters admit nothing — the board replaced the library
  screen, and `FilmGrid`'s only caller now is `Pool`. See the next entry for what that leaves
  behind.
- **`FilmGrid`'s `generation` prop is now dead in production.** Nothing passes it since the
  board replaced the grid on the library screen; only its own test file exercises it. The
  entrance replay it powered is redundant because a new import remounts the grid anyway.
- **`PrefillPanel` receives the unfiltered library, not the pool.** "Pre-fill from my
  ratings" can place titles the filter rail is currently hiding, and its preview counts
  them — the count and the placement agree with each other, just not with what the rail
  shows on screen. Deliberate: the rail filters the pool and only the pool. User-visible,
  and unverified by hand.
- **`<summary>` and the checkboxes take the UA focus ring, not the accent token.** Every
  input and button in the rail carries `focus:ring-accent`; the only keyboard-operable part
  of a *closed* section does not. The specification asks for the accent ring on the section
  itself.
- **`GenreControls`, `EraControls` and `TypeControls` drop a selected-but-unavailable
  option**, where `DirectorControls` deliberately keeps one on screen "so a filter can always
  be undone from the control that set it". A restored criterion the library no longer holds
  is a real case — `services/filters.ts` preserves it on purpose. In three of the four, the
  chip is the only escape hatch; in the fourth, the control is too.
- **`topN: 0` is reachable by typing.** `NumberField`'s `min={1}` is advisory only, and the
  result is an empty grid. The zero-result screen names Top N as the culprit, so the user can
  recover.
- **The README's privacy paragraph says TMDB receives "a title, year, or IMDb identifier"
  for the details request.** It actually receives a TMDB id. Derived from the same data, so
  not a false privacy claim, but not literally accurate either.
- **`filter-status` is a hardcoded document-global id**, now depended on across components so
  `NoResults` can move focus into `FilterStatus`. Fine while `App` renders exactly one of
  them; duplicate ids the moment it does not.

## Testing and tooling

- **Nothing in the checked-in suite drives a real browser.** Every defect the manual passes
  found is now covered by a unit test of the rule it broke, and an axe run over four screens
  at two widths in both themes reports no violations — but all of that was driven from
  throwaway scripts in a session scratchpad. An end-to-end suite that a `npm run` command
  could execute, using Playwright's own Chromium (already cached on this machine), is the
  obvious next investment: real pointer events are the only way most of these defects were
  ever reachable.

- ~~**The tier board's manual verification gate is entirely outstanding.**~~ Closed on
  2026-08-24. The Chrome extension was still not connected, so the pass ran through a real
  Chromium driven by Playwright from the scratchpad instead — a genuine browser with real
  pointer events, which is what drag and drop needs. Verified by hand there: pool to row,
  row to row, forward and backward inside one row, and row back to pool, all landing where
  aimed; the drag overlay tracking the cursor one-for-one, sized like the card, gone on
  drop; undo and redo from both the buttons and Ctrl+Z / Ctrl+Shift+Z; a full keyboard
  ranking (space, arrows, space) with the announcements read back at each step; the board
  surviving a reload; a rename and a recolour done by typing, surviving a reload together
  with the ranking; dragging the *last* card of a 120-film virtualised pool; adding,
  removing, reordering rows and sending everything back to the pool; both themes at 1440px
  and at 390px with no horizontal overflow; and the IndexedDB v2-to-v3 upgrade over a
  hand-built v2 database, which kept three films with their `watchedAt` still a `Date`,
  kept the saved filter criteria, and added the `boards` store. Three defects came out of
  it and are fixed on this branch: the tier palette never reaching the browser, the pool
  taking 78vh so no row was ever on screen with it, and `closestCenter` dropping a film
  into whichever row's centre was nearest rather than the one under the cursor. Three more
  came out of re-running the pass against each fix: an empty pool collapsing to a
  sixty-pixel strip that could not be hit, a card scrolled out of view in the virtualised
  pool winning drops aimed at the row behind it, and dnd-kit auto-scrolling the pool's own
  grid until it unmounted the card being dragged.

  The pass ran through Playwright's own Chromium rather than the extension, and the scripts
  are throwaway — they live in the session scratchpad, not in the repository. Turning the
  useful ones into a checked-in end-to-end suite is the obvious next step and has not been
  taken: every defect above is now covered by a unit test of the rule it broke, but nothing
  in `npm run test:run` drives a real pointer.

  Still not done by a person: listening to an actual screen reader. What was checked is the
  text of the live region at each step, which is what a screen reader would read, not the
  reading itself.
- **The board's save guard has an untested release path.** The debounced save is suppressed
  (`boardReady`) until the board restore settles, and released in a `.finally()` so it fires
  even when `loadFirstBoard()` resolves to `null` — no saved board found. That branch is
  verified by reading the code, not by a test.
- **No domain test covers a non-default tier list.** `tierForRating`, `prefill` and
  `moveFilm` all operate generically on `board.tiers`, but every call to `createBoard` in the
  test suite omits the third argument and gets `DEFAULT_TIERS`. `createBoard` has accepted a
  custom `tiers` array since this plan's first task, so covering it would have been a few
  lines at any point; deferred twice, and recorded here rather than promised to a task that
  does not exist.
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
- **`tests/ui/App.test.tsx` restores its `console.error` spy without `try/finally` in five
  places** (the file contains no `finally` at all), so a `waitFor` timeout would leak the spy
  into later tests in that file.
- **A transient "Unhandled Errors" block attributed to `tests/ui/FilmGrid.test.tsx` appeared
  in 1 of 9 full-suite runs during the filter-rail plan.** A re-review established nothing in
  the filter-rail work can produce it — that file does not render `App` — so it is
  pre-existing and unexplained. Worth a proper look.
- **The disabled-while-fetching sections remain unverified by hand.** On the 6-film import
  used to check the rail, the details pass finished in 277 ms — too fast to observe
  mid-flight. Needs a Letterboxd import large enough that the pass is visible while it runs.
- ~~**The responsive layout below `lg` remains unverified by hand.**~~ Verified by the user
  on the deployed site (2026-08-23): below the breakpoint the rail is replaced by a Filters
  button that opens it. It could not be checked here because the automated browser tab
  reports `visibilityState: "hidden"`, so `requestAnimationFrame` never fires and
  `ResizeObserver` never reports — the layout that depends on a measured width therefore
  cannot be exercised through it at all.

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
