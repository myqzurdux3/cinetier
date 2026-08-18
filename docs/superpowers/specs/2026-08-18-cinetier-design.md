# Cinetier — Design Document

**Date:** 2026-08-18
**Status:** Approved (sections 1–2 in conversation; sections 3–5 pending review)

## 1. Summary

Cinetier turns a person's film history from IMDb or Letterboxd into a tier list.
The user imports their own data export, filters it (by rating, watch date, genre,
director, decade, runtime, rewatch status, or how far their rating strays from the
public one), and gets a tier list that is pre-filled from their ratings and then
adjusted by hand.

The whole application runs in the browser. No account, no server, no upload.

## 2. Goals and non-goals

### Goals

- Import an IMDb `ratings.csv` or a raw Letterboxd export `.zip` without manual preparation.
- Present one unified film library regardless of which service the data came from.
- Filter that library along the axes listed above, combining freely.
- Produce a tier list pre-filled from the user's own ratings, fully editable by drag
  and drop, and equally usable from an empty board for people who want to rank by hand.
- Export the result as a shareable PNG.
- Keep multiple named tier lists across sessions.
- Be genuinely pleasant to use: fast, uncluttered, keyboard-accessible.

### Non-goals for v1

- No backend, no user accounts, no server-side storage.
- No share-by-link URLs.
- No native mobile or desktop application.
- No scraping of IMDb or Letterboxd account pages. It violates both services' terms
  and breaks whenever they change their markup.

### Deferred, designed for but not built

- Letterboxd OAuth. Their API v0 exists but access is granted from a waiting list.
  The source layer is shaped so that adding it touches only `parsers/`.

## 3. Constraints that shaped the design

**IMDb has no public API and no OAuth.** There is no sanctioned way to connect an
IMDb account. The only reliable path is the CSV export the user downloads from their
own account. This is a hard external constraint, not an implementation choice.

**Letterboxd's API requires approved access.** Until a key is granted, the export ZIP
is the only path. It is also the richer one: the export contains full history, while
the public RSS feed is capped at roughly the 50 most recent entries.

**Neither export contains poster images.** TMDB supplies them, matched by IMDb
identifier when available and by title plus year otherwise.

## 4. Data model

### What each source actually provides

| Field | IMDb `ratings.csv` | Letterboxd export |
|---|---|---|
| Stable identifier | `Const` (`tt0133093`) | Letterboxd URI slug |
| Title, year | yes | yes |
| User rating | 1–10 integers | 0.5–5 in half stars |
| Watch date | **no** — only `Date Rated` | yes, `diary.csv` `Watched Date` |
| Rewatch flag | no | yes, `diary.csv` |
| Genres, directors, runtime | yes | no — TMDB fills these |
| Public rating | yes (`IMDb Rating`) | no — TMDB fills this |

Two consequences the UI must be honest about:

- For IMDb imports, "watched date" is really "rated date". The interface labels it as
  such rather than silently presenting an approximation as fact.
- A Letterboxd import is unusable for genre or director filters until TMDB enrichment
  completes. Those filter controls stay disabled with an explanatory note instead of
  appearing broken.

### Unified `Film`

```ts
type Film = {
  id: string;                    // "imdb:tt0133093" | "lb:the-matrix" | "tmdb:603"
  imdbId: string | null;
  tmdbId: number | null;
  title: string;
  year: number | null;
  rating: number | null;         // normalized 0–100, null when watched but unrated
  ratingScale: 'imdb10' | 'letterboxd5';  // how to render it back
  watchedAt: Date | null;
  watchedAtIsApproximate: boolean;        // true for IMDb "date rated"
  isRewatch: boolean;
  genres: string[];
  directors: string[];
  runtimeMinutes: number | null;
  publicRating: number | null;   // normalized 0–100
  posterPath: string | null;
  source: 'imdb' | 'letterboxd';
};
```

**Ratings are normalized to 0–100 internally and always rendered back in their
original scale.** One threshold system for tier auto-fill instead of two, while a
Letterboxd user still sees stars and an IMDb user still sees a mark out of ten.

**Deduplication** when both services are imported: match on IMDb identifier when both
sides have one, otherwise on normalized title plus year. Without this, *Dune* appears
twice on the board. On conflict, the record with the watch date wins, since Letterboxd
diary data is more precise than an IMDb rating date.

### Parsers

Each parser is a pure function from file content to `Film[]`, with no I/O and no
framework dependency. They are tested against small anonymized fixture files committed
to the repository. This is what makes the deferred OAuth connector cheap: one more
source, same output type, zero changes downstream.

## 5. Import flow

Three steps:

1. **Choose a source.** Two cards, IMDb and Letterboxd.
2. **Get the file.** A three-step illustrated guide to where the export lives in that
   service's settings. Most users have never downloaded it.
3. **Drop the file.** The drop zone accepts a loose `.csv` and the raw Letterboxd
   `.zip`, unpacked in the browser. No manual extraction.

**Enrichment is non-blocking.** Fetching TMDB data for 800 films takes several seconds.
The grid renders immediately with typographic title cards; posters fade in as they
arrive. There is no blocking spinner. Results are cached in IndexedDB, so a re-import
or a return visit is instant.

**Errors name the problem.** "This looks like `watchlist.csv`; I need `ratings.csv`"
rather than "import failed". Parse failures report the missing column and the expected
file.

## 6. Main screen

A three-region layout:

- **Filter rail**, left, collapsible. One control per axis: rating threshold, watch
  date range with an "this year" shortcut, genre, director, decade, runtime, rewatch,
  rating-vs-public delta, and a top-N limit. A live count shows how many films match,
  so the user always knows what they are about to rank.
- **Tier board**, upper right. Rows default to S/A/B/C/D/F. Row labels and colors are
  editable; rows can be added, reordered, and removed.
- **Pool**, lower right. Films not yet placed, virtualized so 800 posters stay smooth,
  with a search box and a poster-size control.

**Filling the board.** By default, films drop into tiers according to their imported
rating, using thresholds the user can edit in a small dialog. A single "Send everything
back to the pool" action empties the board for people who want to rank entirely by
hand. Both modes are first-class; neither is hidden behind a setting.

**Drag and drop** uses `dnd-kit`, which gives keyboard operation for free: focus a
card, space to lift, arrows to move, space to drop, with an `aria-live` region
announcing each move. A tier list that only works with a mouse is not finished.

## 7. Persistence and export

IndexedDB via `idb`, three stores:

- `films` — the imported library, keyed by film id.
- `boards` — named tier lists, storing *references* to film ids rather than copies, so
  a re-import updates every board at once.
- `tmdbCache` — poster paths and enrichment results, with a time-to-live.

**PNG export** renders offscreen at 2× through `html-to-image`, including the board
title and a small footer carrying the required TMDB attribution.

**JSON export/import** uses a versioned envelope (`{ schemaVersion: 1, ... }`) with a
migration path, so a file saved today still opens after the format evolves.

**Privacy.** Nothing leaves the browser except TMDB lookups, which carry only a title,
year, or IMDb identifier — never the user's ratings or history. Stated plainly both in
the interface and the README.

## 8. Visual design

"Dark theatre": near-black background, posters lifted off the surface as on a cinema
wall, a single warm accent color. Tier colors are the only saturated elements on screen,
so the eye goes straight to the ranking. Type is set for density without crowding,
since the core screen shows hundreds of small images at once.

**Name:** Cinetier. **Logo:** a clapperboard whose diagonal stripes carry the tier
colors, reducing cleanly to a 16px favicon.

## 9. Technical architecture

React, TypeScript in strict mode, Vite, Tailwind. Layered:

```
src/
  parsers/     imdb.ts, letterboxd.ts   pure: file content -> Film[]
  domain/      film.ts, filters.ts, tiers.ts, dedupe.ts   pure TypeScript, no React
  services/    tmdb.ts, storage.ts      the only I/O boundaries
  ui/          components and screens
```

The rule: `domain/` imports nothing from `ui/` or `services/`. It is plain TypeScript,
so its tests run in milliseconds without a browser, and it is where every rule worth
testing lives.

Key dependencies: `papaparse` (CSV), `zip.js` (Letterboxd archive), `dnd-kit` (drag and
drop), `idb` (IndexedDB), `html-to-image` (PNG), `@tanstack/react-virtual` (pool).

**The TMDB key ships in the client bundle.** This is standard for keyless-user client
applications and permitted by TMDB for read access, but it is a public value, not a
secret. It is documented as such in the README, injected at build time via
`VITE_TMDB_API_KEY`, and anyone forking the project supplies their own.

## 10. Testing

- **Unit (Vitest):** parsers against real fixture exports, rating normalization, scale
  round-tripping, deduplication, every filter predicate, tier threshold assignment.
- **Component:** drag and drop by keyboard, filter interactions, empty and error states.
- **End-to-end (Playwright):** the full path — import a fixture, filter it, move a card,
  export a PNG, reload and confirm the board persisted.

Tests are written before the code they cover.

## 11. Repository quality

Public GitHub repository, MIT licensed.

- **README** leading with a screenshot, a one-line statement of what it does, a live
  demo link, then features, the privacy note, and a quickstart.
- **Conventional Commits**, enforced by commitlint; ESLint, Prettier, and strict
  TypeScript enforced by lint-staged on commit.
- **CI (GitHub Actions):** typecheck, lint, unit tests, end-to-end tests, and build on
  every pull request. Deploy to GitHub Pages on merge to `main`.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and pull request
  templates, Dependabot, and a `CHANGELOG.md` in Keep a Changelog format.
- Attribution: TMDB's required notice, and no use of Letterboxd or IMDb logos or marks
  beyond naming them factually.

## 12. Risks

| Risk | Mitigation |
|---|---|
| IMDb changes its CSV columns | Parsers validate headers and fail with a precise message; fixtures catch drift in CI |
| TMDB matching fails on ambiguous titles | Match by IMDb id first; fall back to title+year; leave a typographic card rather than a wrong poster |
| Large libraries (5000+ films) | Virtualized pool, batched enrichment, cached results |
| Letterboxd API access never granted | The product is complete without it; it is an enhancement, not a dependency |
