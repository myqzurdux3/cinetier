# Cinetier Filter Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the library screen a filter rail that slices it along every axis
the domain already understands, and fetch the metadata Letterboxd exports do not
carry so those axes work for everyone.

**Architecture:** The filtering rules already exist in `src/domain/filters.ts`
and are tested; this plan gives them a face and fills their inputs. Three layers
change. `domain/` gains pure helpers: the option lists a control may offer, and
the explanation the zero-result screen shows. `services/` gains a store for the
active criteria and two TMDB detail endpoints. `ui/` gains the rail itself,
controlled entirely by `App`, which holds the criteria in state, persists them,
and applies them to the library before it reaches the grid.

**Tech Stack:** React 19, TypeScript 6 (strict, `noUncheckedIndexedAccess`),
Vite 8, Tailwind CSS v4, Vitest 4 (projects `core` in node, `ui` in jsdom),
`idb` for IndexedDB, `@tanstack/react-virtual` for the grid.

**Spec:** `docs/superpowers/specs/2026-08-19-cinetier-filter-rail-design.md`

## Global Constraints

These hold for every task. A task's requirements implicitly include this section.

- **Layering, enforced by ESLint.** `src/domain/**` and `src/parsers/**` must not
  import from `ui/`, `services/`, `enrich/`, or React, must not use a dynamic
  `import()`, and must not touch `window`, `document`, `navigator`, `fetch`,
  `XMLHttpRequest`, `localStorage`, `sessionStorage`, `indexedDB`, or `process`.
  Network and storage live in `services/`. `enrich/` may use both.
- **No colour literal anywhere in `src/ui/**`** except `src/ui/logoMark.ts` — not
  in a string, not inside a template literal. Colours come from the theme tokens
  in `src/index.css` (`text-ink`, `text-ink-dim`, `bg-surface`,
  `bg-surface-raised`, `border-line`, `accent-accent`, `text-accent`,
  `rounded-card`, `font-display`). ESLint fails the build otherwise.
- **Never stage or commit `.env.local`, `.env`, or any file containing an API
  key.** The TMDB key ships in the client bundle **by design** and is documented
  as such in the README — it is not a leak to "fix".
- **Fonts stay self-hosted.** No `fonts.googleapis.com`, no `fonts.gstatic.com`,
  no CDN of any kind: the README promises the only outbound requests go to TMDB.
- **Both themes.** Anything visible must work under the default palette and
  under `[data-theme='neon']`. Using tokens rather than literals is what makes
  that automatic.
- **Coverage thresholds are enforced by CI:** statements 90, branches 85,
  functions 90, lines 90, over `src/domain/**`, `src/parsers/**`,
  `src/services/**`, `src/enrich/**`, `src/ui/**`.
- **Commits follow Conventional Commits**, enforced by commitlint. husky and
  lint-staged run ESLint and Prettier on commit.
- **Run the suite with the package scripts**, never bare `vitest`: they set
  `NODE_OPTIONS=--no-experimental-webstorage`, without which Node 26's global
  `localStorage` shadows jsdom's and the theme tests fail.
- **A test that cannot fail is worse than no test.** Before committing any test,
  break the code it covers and watch it go red. Several of this project's past
  tests passed with the behaviour they claimed to check deleted.

## Two deviations from the spec, decided here

**The Era section offers decades only, not a free year range.** The spec asks for
"decades present in the library, and a year range" while also stating that
`FilterCriteria` needs no new axis. Those two cannot both hold: there is no
`minYear`/`maxYear` criterion, and translating 1985–1995 into decades admits
1980–1999, which is a different question than the one asked. Decades are exact
and already supported; a year range is recorded in the backlog as a candidate
criterion for a later plan.

**Reviving dates on read is defensive, not corrective.** The spec says a naïve
round trip returns strings. That is true of JSON and false of IndexedDB, which
stores structured clones and hands `Date` objects back as `Date` objects — this
is why `saveLibrary` works today. The store therefore keeps the clone's
behaviour and pins it with a test, and additionally narrows on read: a value that
is not a usable `Date` is dropped rather than passed to the filter predicates,
where a string survives a `typeof` check and then throws at comparison time. That
covers a criteria object arriving from a future JSON import path.

## File structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/services/filters.ts` | Persist and restore the active criteria |
| `src/services/tmdbDetailsCache.ts` | Cache TMDB detail responses, 30-day TTL |
| `src/enrich/enrichDetails.ts` | The second enrichment pass over the library |
| `src/ui/filters/fields.tsx` | Number, checkbox and date field primitives |
| `src/ui/filters/CheckboxList.tsx` | A list of checkboxes over a set of options |
| `src/ui/filters/FilterSection.tsx` | One collapsible section, with its count |
| `src/ui/filters/FilterControls.tsx` | The eight groups of controls |
| `src/ui/filters/FilterRail.tsx` | The rail: sections, order, counts, disabling |
| `src/ui/filters/FilterStatus.tsx` | The result count, the chips, clear-all |
| `src/ui/filters/NoResults.tsx` | The zero-result screen |
| `tests/support/film.ts` | One `Film` factory for the tests written here |

**Modified:**

| File | Change |
| --- | --- |
| `src/domain/film.ts` | `detailsFetched: boolean` |
| `src/domain/dedupe.ts` | Merge `detailsFetched` with a logical OR |
| `src/domain/filters.ts` | Option lists, criterion helpers, the explainer |
| `src/parsers/imdb.ts`, `src/parsers/letterboxd.ts` | Set `detailsFetched: false` |
| `src/services/db.ts` | Schema version 2: `filters` and `tmdbDetails` stores |
| `src/services/tmdb.ts` | `fetchMovieDetails`, `fetchTvDetails` |
| `src/ui/App.tsx` | Criteria state, persistence, the details pass, the layout |
| `README.md`, `CHANGELOG.md`, `docs/superpowers/backlog.md` | What shipped |

---

### Task 1: `Film.detailsFetched`

Without this flag, an empty `genres` array means two different things — nobody
asked TMDB yet, or TMDB was asked and the title genuinely has none. The rail
cannot tell the truth about its own option lists while those are the same value.

**Files:**
- Modify: `src/domain/film.ts`
- Modify: `src/domain/dedupe.ts`
- Modify: `src/parsers/imdb.ts:103`, `src/parsers/letterboxd.ts:75`
- Create: `tests/support/film.ts`
- Test: `tests/domain/dedupe.test.ts`, `tests/parsers/imdb.test.ts`

**Interfaces:**
- Produces: `Film.detailsFetched: boolean` — false from both parsers, set true
  only by the details pass in Task 6. `makeFilm(overrides?: Partial<Film>): Film`
  from `tests/support/film.ts`, for the tests written in later tasks.

- [ ] **Step 1: Write the failing merge tests**

In `tests/domain/dedupe.test.ts`, add inside the existing top-level `describe`:

```ts
it('remembers that details were fetched, whichever record carries the flag', () => {
  // Both directions, deliberately. With the IMDb record as the merge base, an
  // implementation that simply kept `base.detailsFetched` would pass the first
  // case and fail the second — which is the whole point of the OR.
  const fromImdb = mergeLibraries(
    [film({ title: 'Heat', year: 1995, imdbId: 'tt0113277', detailsFetched: true })],
    [film({ title: 'Heat', year: 1995, imdbId: null, source: 'letterboxd' })],
  );
  expect(fromImdb).toHaveLength(1);
  expect(fromImdb[0]!.detailsFetched).toBe(true);

  const fromLetterboxd = mergeLibraries(
    [film({ title: 'Heat', year: 1995, imdbId: 'tt0113277' })],
    [
      film({
        title: 'Heat',
        year: 1995,
        imdbId: null,
        source: 'letterboxd',
        detailsFetched: true,
      }),
    ],
  );
  expect(fromLetterboxd).toHaveLength(1);
  expect(fromLetterboxd[0]!.detailsFetched).toBe(true);
});

it('leaves detailsFetched false when neither record was enriched', () => {
  const merged = mergeLibraries(
    [film({ title: 'Heat', year: 1995, imdbId: 'tt0113277' })],
    [film({ title: 'Heat', year: 1995, imdbId: null, source: 'letterboxd' })],
  );
  expect(merged[0]!.detailsFetched).toBe(false);
});
```

In `tests/parsers/imdb.test.ts`, add inside the existing top-level `describe`:

```ts
it('marks every imported film as not yet enriched with details', () => {
  const result = parseImdbRatings(fixture);
  expect(result.films.every((f) => f.detailsFetched === false)).toBe(true);
});
```

Use whatever the surrounding tests already call the fixture string and the parse
function; do not introduce a second name for either.

- [ ] **Step 2: Run the tests and watch them fail**

```bash
npm run test:run -- tests/domain/dedupe.test.ts tests/parsers/imdb.test.ts
```

Expected: TypeScript errors — `detailsFetched` is not a property of `Film`.

- [ ] **Step 3: Add the field to the model**

In `src/domain/film.ts`, after `posterPath`:

```ts
  /**
   * True once TMDB has been asked for this title's genres, directors and
   * runtime — whatever it answered. An empty `genres` array with this false
   * means "not asked yet"; with this true it means "asked, and there are none".
   * The filter rail cannot describe its own options honestly without the
   * difference.
   */
  detailsFetched: boolean;
```

- [ ] **Step 4: Merge it, and make it part of the fold fingerprint**

In `src/domain/dedupe.ts`, inside `mergeFilm`'s returned object, after
`posterPath`:

```ts
    // Either record having been enriched means the merged film has been.
    detailsFetched: base.detailsFetched || incoming.detailsFetched,
```

and in `foldKey`'s array, after `film.posterPath ?? ''`:

```ts
    film.detailsFetched,
```

- [ ] **Step 5: Set it in both parsers**

In `src/parsers/imdb.ts` and `src/parsers/letterboxd.ts`, in the object literal
that builds each `Film`, beside `posterPath: null`:

```ts
      detailsFetched: false,
```

- [ ] **Step 6: Repair every test that builds a Film literal**

`npm run typecheck` now lists each one. In each, add `detailsFetched: false` to
the literal. The files are `tests/domain/dedupe.test.ts`,
`tests/domain/filters.test.ts`, `tests/domain/tiers.test.ts`,
`tests/enrich/enrichLibrary.test.ts`, `tests/services/library.test.ts`,
`tests/ui/App.test.tsx`, `tests/ui/FilmCard.test.tsx`,
`tests/ui/FilmGrid.test.tsx`, `tests/ui/LibraryHeader.test.tsx`,
`tests/ui/LibrarySummary.test.tsx`. In the factories that spread
`...overrides` last, the default alone is enough. Do not otherwise restructure
those factories — collapsing them into one shared helper is backlog work and not
this plan's job.

- [ ] **Step 7: Create the shared factory for the tests this plan adds**

Create `tests/support/film.ts`:

```ts
import type { Film } from '@/domain/film';

/**
 * A film with every field at a neutral default, for tests that care about one
 * or two of them. New tests use this; the older per-file factories stay as they
 * are.
 */
export function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: overrides.title ? `test:${overrides.title}` : 'test:untitled',
    imdbId: null,
    tmdbId: null,
    title: 'Untitled',
    year: 2000,
    titleType: 'movie',
    rating: null,
    ratingScale: 'imdb10',
    watchedAt: null,
    watchedAtIsApproximate: false,
    isRewatch: false,
    genres: [],
    directors: [],
    runtimeMinutes: null,
    publicRating: null,
    posterPath: null,
    detailsFetched: false,
    source: 'imdb',
    ...overrides,
  };
}
```

- [ ] **Step 8: Run the whole suite**

```bash
npm run test:run && npm run typecheck && npm run lint
```

Expected: all green, including the two new dedupe cases.

- [ ] **Step 9: Prove the merge test can fail**

Change `base.detailsFetched || incoming.detailsFetched` to
`base.detailsFetched`, run `npm run test:run -- tests/domain/dedupe.test.ts`,
confirm the second direction goes red, then put the `||` back and confirm green.

- [ ] **Step 10: Commit**

```bash
git add src/domain/film.ts src/domain/dedupe.ts src/parsers/imdb.ts src/parsers/letterboxd.ts tests
git commit -m "feat(domain): record whether a film's details were ever fetched"
```

---

### Task 2: The option lists a control may offer

Every control must offer only values the library actually holds. `availableGenres`,
`availableDirectors` and `availableTitleTypes` already exist; the Era and Runtime
sections need the same.

**Files:**
- Modify: `src/domain/filters.ts`
- Test: `tests/domain/filters.test.ts`

**Interfaces:**
- Consumes: `makeFilm` from Task 1 (the existing file-local `film` factory in
  `tests/domain/filters.test.ts` is fine here too — use whichever the file
  already uses).
- Produces: `availableDecades(films: Film[]): number[]` — decade start years,
  ascending. `runtimeBounds(films: Film[]): { min: number; max: number } | null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/domain/filters.test.ts`:

```ts
describe('availableDecades', () => {
  it('lists each decade present once, oldest first', () => {
    const films = [
      film({ title: 'Pulp Fiction', year: 1994 }),
      film({ title: 'The Matrix', year: 1999 }),
      film({ title: 'Blade Runner', year: 1982 }),
    ];
    expect(availableDecades(films)).toEqual([1980, 1990]);
  });

  it('ignores films with no year rather than inventing a decade for them', () => {
    expect(availableDecades([film({ title: 'Unknown', year: null })])).toEqual([]);
  });
});

describe('runtimeBounds', () => {
  it('reports the shortest and the longest runtime present', () => {
    const films = [
      film({ title: 'Short', runtimeMinutes: 74 }),
      film({ title: 'Long', runtimeMinutes: 201 }),
      film({ title: 'Middle', runtimeMinutes: 120 }),
      film({ title: 'Unknown', runtimeMinutes: null }),
    ];
    expect(runtimeBounds(films)).toEqual({ min: 74, max: 201 });
  });

  it('reports nothing when no film carries a runtime', () => {
    // Which is a Letterboxd-only library before the details pass has run. The
    // Runtime section reads this to decide it has nothing to offer yet.
    expect(runtimeBounds([film({ title: 'Unknown', runtimeMinutes: null })])).toBeNull();
  });
});
```

Add `availableDecades` and `runtimeBounds` to the file's existing import from
`@/domain/filters`.

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/domain/filters.test.ts
```

Expected: FAIL — neither export exists.

- [ ] **Step 3: Implement both**

Append to `src/domain/filters.ts`:

```ts
/** Decade start years present in the library, ascending: [1980, 1990]. */
export function availableDecades(films: Film[]): number[] {
  const decades = new Set<number>();
  for (const film of films) {
    if (film.year === null) continue;
    decades.add(Math.floor(film.year / 10) * 10);
  }
  return [...decades].sort((a, b) => a - b);
}

/**
 * The runtimes the library spans, or null when nothing carries one — which is
 * every Letterboxd import until the details pass has run.
 */
export function runtimeBounds(films: Film[]): { min: number; max: number } | null {
  const runtimes = films
    .map((film) => film.runtimeMinutes)
    .filter((runtime): runtime is number => runtime !== null);
  if (runtimes.length === 0) return null;
  return { min: Math.min(...runtimes), max: Math.max(...runtimes) };
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npm run test:run -- tests/domain/filters.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/filters.ts tests/domain/filters.test.ts
git commit -m "feat(domain): report the decades and runtimes a library spans"
```

---

### Task 3: Talking about criteria — which are set, what they say, which one is cutting

The chips, the per-section counts and the zero-result screen all need to treat a
criterion as a thing that can be named, removed, and measured. That is pure logic
over the library, so it lives beside the predicates it reasons about.

**Files:**
- Modify: `src/domain/filters.ts`
- Test: `tests/domain/filters.test.ts`

**Interfaces:**
- Produces:
  - `type CriterionKey = keyof FilterCriteria`
  - `isCriterionActive(criteria: FilterCriteria, key: CriterionKey): boolean`
  - `activeCriteria(criteria: FilterCriteria): CriterionKey[]`
  - `withoutCriterion(criteria: FilterCriteria, key: CriterionKey): FilterCriteria`
  - `subsetCriteria(criteria: FilterCriteria, keys: readonly CriterionKey[]): FilterCriteria`
  - `describeCriterion(key: CriterionKey, criteria: FilterCriteria): string`
  - `mostRestrictiveCriterion(films: Film[], criteria: FilterCriteria): CriterionKey | null`

- [ ] **Step 1: Write the failing tests**

Append to `tests/domain/filters.test.ts`:

```ts
describe('activeCriteria', () => {
  it('ignores keys that are absent, undefined, empty, or false', () => {
    // Every control writes `undefined` rather than deleting a key, and an
    // unchecked box writes `false`. None of those is a filter, and treating one
    // as active would light up the clear-all action over an unfiltered library.
    const criteria: FilterCriteria = {
      minRating: undefined,
      genres: [],
      onlyUnrated: false,
      titleTypes: ['movie'],
      topN: 25,
    };
    expect(activeCriteria(criteria)).toEqual(['titleTypes', 'topN']);
  });

  it('counts a zero bound as active, because zero is a bound', () => {
    expect(activeCriteria({ minRating: 0 })).toEqual(['minRating']);
  });
});

describe('withoutCriterion', () => {
  it('removes exactly the named criterion', () => {
    const criteria: FilterCriteria = { minRating: 80, genres: ['Drama'], topN: 10 };
    expect(withoutCriterion(criteria, 'genres')).toEqual({ minRating: 80, topN: 10 });
  });

  it('leaves the original untouched', () => {
    const criteria: FilterCriteria = { minRating: 80 };
    withoutCriterion(criteria, 'minRating');
    expect(criteria.minRating).toBe(80);
  });
});

describe('subsetCriteria', () => {
  it('keeps only the named keys, and only when they are active', () => {
    const criteria: FilterCriteria = {
      minRating: 80,
      maxRating: undefined,
      genres: ['Drama'],
    };
    expect(subsetCriteria(criteria, ['minRating', 'maxRating'])).toEqual({ minRating: 80 });
  });
});

describe('describeCriterion', () => {
  it('names each criterion in the words the chip shows', () => {
    expect(describeCriterion('minRating', { minRating: 80 })).toBe('Rating 80 or more');
    expect(describeCriterion('maxRating', { maxRating: 60 })).toBe('Rating 60 or less');
    expect(describeCriterion('onlyUnrated', { onlyUnrated: true })).toBe('Unrated only');
    expect(describeCriterion('genres', { genres: ['Drama', 'Crime'] })).toBe('Genre: Drama, Crime');
    expect(describeCriterion('directors', { directors: ['Michael Mann'] })).toBe(
      'Director: Michael Mann',
    );
    expect(describeCriterion('decades', { decades: [1980, 1990] })).toBe('Decade: 1980s, 1990s');
    expect(describeCriterion('titleTypes', { titleTypes: ['movie', 'series'] })).toBe(
      'Type: films, series',
    );
    expect(describeCriterion('minRuntimeMinutes', { minRuntimeMinutes: 90 })).toBe(
      'At least 90 minutes',
    );
    expect(describeCriterion('maxRuntimeMinutes', { maxRuntimeMinutes: 120 })).toBe(
      'At most 120 minutes',
    );
    expect(describeCriterion('onlyRewatches', { onlyRewatches: true })).toBe('Rewatches only');
    expect(describeCriterion('topN', { topN: 50 })).toBe('Top 50');
  });

  it('writes dates in an unambiguous order, not the machine locale', () => {
    // A test that formatted through toLocaleDateString would pass on the author's
    // machine and fail in CI, or worse, pass in both while showing 03/09 to a
    // reader who reads it as September.
    expect(describeCriterion('watchedAfter', { watchedAfter: new Date(2024, 0, 31) })).toBe(
      'Watched after 2024-01-31',
    );
    expect(describeCriterion('watchedBefore', { watchedBefore: new Date(2025, 11, 1) })).toBe(
      'Watched before 2025-12-01',
    );
  });

  it('states a rating delta in the direction the reader set it', () => {
    // maxRatingDelta is stored negative — "delta at most -10" is "10 below the
    // public score" — and a chip reading "-10" would be unreadable.
    expect(describeCriterion('minRatingDelta', { minRatingDelta: 10 })).toBe(
      '10 or more above the public score',
    );
    expect(describeCriterion('maxRatingDelta', { maxRatingDelta: -10 })).toBe(
      '10 or more below the public score',
    );
  });
});

describe('mostRestrictiveCriterion', () => {
  const library = [
    film({ title: 'A', rating: 95, genres: ['Drama'] }),
    film({ title: 'B', rating: 40, genres: ['Drama'] }),
    film({ title: 'C', rating: 30, genres: ['Comedy'] }),
    film({ title: 'D', rating: 20, genres: ['Comedy'] }),
  ];

  it('names the criterion whose removal admits the most films', () => {
    // minRating 90 alone admits one film; genres ['Drama'] alone admits two.
    // Together they admit one, so removing minRating gains one and removing
    // genres gains nothing.
    expect(mostRestrictiveCriterion(library, { minRating: 90, genres: ['Drama'] })).toBe(
      'minRating',
    );
  });

  it('names the other one when the balance reverses', () => {
    expect(mostRestrictiveCriterion(library, { minRating: 20, genres: ['Comedy'] })).toBe(
      'genres',
    );
  });

  it('reports nothing when no single removal admits another film', () => {
    // Two criteria that each exclude everything on their own: removing either
    // leaves the other still admitting nothing, so there is no one culprit to
    // name and the screen must say so instead of blaming an innocent control.
    expect(mostRestrictiveCriterion(library, { minRating: 99, genres: ['Western'] })).toBeNull();
  });

  it('reports nothing when nothing is filtered', () => {
    expect(mostRestrictiveCriterion(library, {})).toBeNull();
  });
});
```

Add every new name to the file's import from `@/domain/filters`, and
`import type { FilterCriteria } from '@/domain/filters'` if the file does not
already import the type.

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/domain/filters.test.ts
```

Expected: FAIL — the exports do not exist.

- [ ] **Step 3: Implement the helpers**

Append to `src/domain/filters.ts`:

```ts
export type CriterionKey = keyof FilterCriteria;

/**
 * Every criterion, in the order the interface talks about them. Chips follow
 * it, and mostRestrictiveCriterion breaks ties with it, so two libraries in the
 * same state always produce the same words in the same order.
 */
const CRITERION_ORDER: readonly CriterionKey[] = [
  'titleTypes',
  'decades',
  'minRating',
  'maxRating',
  'onlyUnrated',
  'minRatingDelta',
  'maxRatingDelta',
  'genres',
  'directors',
  'minRuntimeMinutes',
  'maxRuntimeMinutes',
  'watchedAfter',
  'watchedBefore',
  'onlyRewatches',
  'topN',
];

/**
 * Whether a criterion is actually filtering anything.
 *
 * The controls write `undefined` to clear a bound and `false` to clear a
 * checkbox rather than deleting keys, so "the key is present" is not the same
 * question. A numeric zero is a real bound and stays active.
 */
export function isCriterionActive(criteria: FilterCriteria, key: CriterionKey): boolean {
  const value = criteria[key];
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return true;
}

export function activeCriteria(criteria: FilterCriteria): CriterionKey[] {
  return CRITERION_ORDER.filter((key) => isCriterionActive(criteria, key));
}

export function withoutCriterion(criteria: FilterCriteria, key: CriterionKey): FilterCriteria {
  const next = { ...criteria };
  delete next[key];
  return next;
}

/** The active part of `criteria` restricted to `keys` — one section's own share. */
export function subsetCriteria(
  criteria: FilterCriteria,
  keys: readonly CriterionKey[],
): FilterCriteria {
  const next: FilterCriteria = {};
  for (const key of keys) {
    if (!isCriterionActive(criteria, key)) continue;
    // Each key carries its own value type and TypeScript cannot narrow a
    // dynamic key to it; the copy is value-preserving by construction.
    (next as Record<string, unknown>)[key] = criteria[key];
  }
  return next;
}

/** ISO calendar date in local time — never a locale format, which reads differently per reader. */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** What a chip for this criterion says. Assumes the criterion is active. */
export function describeCriterion(key: CriterionKey, criteria: FilterCriteria): string {
  switch (key) {
    case 'titleTypes':
      return `Type: ${(criteria.titleTypes ?? []).map((type) => TITLE_TYPE_LABELS[type].many).join(', ')}`;
    case 'decades':
      return `Decade: ${(criteria.decades ?? []).map((decade) => `${decade}s`).join(', ')}`;
    case 'minRating':
      return `Rating ${criteria.minRating} or more`;
    case 'maxRating':
      return `Rating ${criteria.maxRating} or less`;
    case 'onlyUnrated':
      return 'Unrated only';
    case 'minRatingDelta':
      return `${criteria.minRatingDelta} or more above the public score`;
    case 'maxRatingDelta':
      return `${Math.abs(criteria.maxRatingDelta ?? 0)} or more below the public score`;
    case 'genres':
      return `Genre: ${(criteria.genres ?? []).join(', ')}`;
    case 'directors':
      return `Director: ${(criteria.directors ?? []).join(', ')}`;
    case 'minRuntimeMinutes':
      return `At least ${criteria.minRuntimeMinutes} minutes`;
    case 'maxRuntimeMinutes':
      return `At most ${criteria.maxRuntimeMinutes} minutes`;
    case 'watchedAfter':
      return `Watched after ${isoDate(criteria.watchedAfter!)}`;
    case 'watchedBefore':
      return `Watched before ${isoDate(criteria.watchedBefore!)}`;
    case 'onlyRewatches':
      return 'Rewatches only';
    case 'topN':
      return `Top ${criteria.topN}`;
  }
}

/**
 * The active criterion whose removal would admit the most films, or null when
 * no single removal admits any — two criteria can exclude everything between
 * them with neither one to blame, and naming an innocent control is worse than
 * saying so.
 */
export function mostRestrictiveCriterion(
  films: Film[],
  criteria: FilterCriteria,
): CriterionKey | null {
  const active = activeCriteria(criteria);
  if (active.length === 0) return null;

  const current = applyFilters(films, criteria).length;
  let best: CriterionKey | null = null;
  let bestGain = 0;

  for (const key of active) {
    const gain = applyFilters(films, withoutCriterion(criteria, key)).length - current;
    // Strictly greater, so a tie goes to whichever comes first in
    // CRITERION_ORDER rather than to the last one examined.
    if (gain > bestGain) {
      bestGain = gain;
      best = key;
    }
  }

  return best;
}
```

Add `TITLE_TYPE_LABELS` to the existing `titleType` import at the top of the
file; it is currently a type-only import of `TitleType`, so it becomes two
imports — a value import and a type import.

- [ ] **Step 4: Run them and watch them pass**

```bash
npm run test:run -- tests/domain/filters.test.ts && npm run typecheck && npm run lint
```

Expected: PASS, clean.

- [ ] **Step 5: Prove the tie-break and the null case can fail**

Change `gain > bestGain` to `gain >= bestGain` and confirm
`mostRestrictiveCriterion` still returns null for the two-criteria case (it
should — `bestGain` starts at 0 and no removal gains anything, but `>=` would
now name the last key examined, turning that test red). Restore `>`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/filters.ts tests/domain/filters.test.ts
git commit -m "feat(domain): name, remove and rank individual filter criteria"
```

---

### Task 4: Storage schema 2 — the filter criteria, and a place for detail responses

One schema change rather than two: the criteria store this task needs and the
detail cache Task 5 needs are created together, so a browser upgrades once.

**Files:**
- Modify: `src/services/db.ts`
- Create: `src/services/filters.ts`
- Test: `tests/services/filters.test.ts`

**Interfaces:**
- Consumes: `FilterCriteria`, `activeCriteria` from `@/domain/filters` (Task 3).
- Produces: `saveFilters(criteria: FilterCriteria): Promise<void>`,
  `loadFilters(): Promise<FilterCriteria | null>`,
  `clearFilters(): Promise<void>`. Object stores `filters` and `tmdbDetails`,
  both keyed by string.

- [ ] **Step 1: Write the failing tests**

Create `tests/services/filters.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveFilters, loadFilters, clearFilters } from '@/services/filters';
import { db, resetDatabase } from '@/services/db';
import type { FilterCriteria } from '@/domain/filters';

beforeEach(async () => {
  await resetDatabase();
});

describe('filter persistence', () => {
  it('reports nothing when nothing was ever saved', async () => {
    expect(await loadFilters()).toBeNull();
  });

  it('round-trips a set of criteria', async () => {
    const criteria: FilterCriteria = { minRating: 80, genres: ['Drama'], topN: 25 };
    await saveFilters(criteria);
    expect(await loadFilters()).toEqual(criteria);
  });

  it('restores watch dates as Date objects, not strings', async () => {
    // The filter predicates compare with < and >. A string survives every
    // typeof check on the way in and then compares as text.
    await saveFilters({ watchedAfter: new Date('2024-01-31T00:00:00Z') });
    const restored = await loadFilters();
    expect(restored!.watchedAfter).toBeInstanceOf(Date);
    expect(restored!.watchedAfter!.toISOString()).toContain('2024-01-31');
  });

  it('revives a date that was stored as a string', async () => {
    // Not something this store writes — it is what a criteria object arriving
    // from a JSON import path would look like.
    await (await db()).put(
      'filters',
      { criteria: { watchedBefore: '2025-12-01T00:00:00.000Z' }, savedAt: Date.now() },
      'current',
    );
    const restored = await loadFilters();
    expect(restored!.watchedBefore).toBeInstanceOf(Date);
  });

  it('drops a date that cannot be read at all', async () => {
    await (await db()).put(
      'filters',
      { criteria: { watchedBefore: 'not a date', minRating: 50 }, savedAt: Date.now() },
      'current',
    );
    const restored = await loadFilters();
    expect(restored).toEqual({ minRating: 50 });
  });

  it('restores an empty criteria object as no filter at all', async () => {
    // Saving {} and restoring it as a filtered view would show a clear-all
    // action over a library nobody has filtered.
    await saveFilters({});
    expect(await loadFilters()).toBeNull();
  });

  it('restores criteria the library can no longer satisfy, rather than editing them', async () => {
    // A genre no film carries admits nothing, and the zero-result screen
    // explains that. Silently dropping it would change what the user asked for.
    await saveFilters({ genres: ['Nonexistent'] });
    expect(await loadFilters()).toEqual({ genres: ['Nonexistent'] });
  });

  it('forgets the criteria when asked', async () => {
    await saveFilters({ minRating: 80 });
    await clearFilters();
    expect(await loadFilters()).toBeNull();
  });
});
```

Note the two tests that write through `db()` directly: they need `db` exported
from `@/services/db`, which it already is.

The `criteria` value written in those two tests does not match the store's
declared type, so cast it at the call site with
`as unknown as { criteria: FilterCriteria; savedAt: number }` — the point of
those tests is precisely a value the type says cannot happen.

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/services/filters.test.ts
```

Expected: FAIL — `@/services/filters` does not exist.

- [ ] **Step 3: Take the database to version 2**

In `src/services/db.ts`, add the two stores to the schema and bump the version:

```ts
import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TmdbMatch, TmdbDetails } from './tmdb';
import type { Film } from '@/domain/film';
import type { FilterCriteria } from '@/domain/filters';

export interface CinetierDB extends DBSchema {
  tmdb: {
    key: string;
    value: { match: TmdbMatch | null; fetchedAt: number };
  };
  tmdbDetails: {
    key: string;
    value: { details: TmdbDetails | null; fetchedAt: number };
  };
  library: {
    key: string;
    value: { films: Film[]; savedAt: number };
  };
  filters: {
    key: string;
    value: { criteria: FilterCriteria; savedAt: number };
  };
}

const NAME = 'cinetier';
const VERSION = 2;

const STORES = ['tmdb', 'tmdbDetails', 'library', 'filters'] as const;

let connection: Promise<IDBPDatabase<CinetierDB>> | null = null;

export function db(): Promise<IDBPDatabase<CinetierDB>> {
  connection ??= openDB<CinetierDB>(NAME, VERSION, {
    upgrade(database) {
      // createObjectStore throws on a store that already exists, and anyone
      // who has visited before arrives here with two of these already made.
      // Creating what is missing is version-independent, so a later bump does
      // not have to know which version each visitor is coming from.
      for (const store of STORES) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
      }
    },
  });
  return connection;
}
```

`TmdbDetails` is added to `src/services/tmdb.ts` in Task 5; until then this file
will not typecheck. Add the type there first if you are running the tasks out of
order:

```ts
export interface TmdbDetails {
  genres: string[];
  runtimeMinutes: number | null;
  directors: string[];
}
```

- [ ] **Step 4: Write the store**

Create `src/services/filters.ts`:

```ts
import { db } from './db';
import { activeCriteria, type FilterCriteria } from '@/domain/filters';

const KEY = 'current';

export async function saveFilters(criteria: FilterCriteria): Promise<void> {
  await (await db()).put('filters', { criteria, savedAt: Date.now() }, KEY);
}

/**
 * IndexedDB stores structured clones, so a Date written here comes back a Date
 * and this normally hands the value straight through. It exists for what the
 * clone cannot promise: a criteria object that reached the store some other way
 * — a JSON import, an older build — where a date is a string. Such a string
 * passes every check the filter predicates make and then compares as text.
 */
function reviveDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

export async function loadFilters(): Promise<FilterCriteria | null> {
  const entry = await (await db()).get('filters', KEY);
  if (!entry) return null;

  const stored: FilterCriteria = { ...entry.criteria };
  for (const key of ['watchedAfter', 'watchedBefore'] as const) {
    if (stored[key] === undefined) continue;
    const revived = reviveDate(stored[key]);
    if (revived) stored[key] = revived;
    else delete stored[key];
  }

  // An empty criteria object is not a filtered view that happens to admit
  // everything; it is no filter, and restoring it as one is the same mistake
  // that made an empty saved library restore as a library.
  return activeCriteria(stored).length > 0 ? stored : null;
}

export async function clearFilters(): Promise<void> {
  await (await db()).delete('filters', KEY);
}
```

- [ ] **Step 5: Run the storage tests**

```bash
npm run test:run -- tests/services/filters.test.ts tests/services/library.test.ts tests/services/tmdbCache.test.ts
```

Expected: PASS, all three — the version bump must not disturb the two stores
that already existed.

- [ ] **Step 6: Prove the upgrade path by hand**

The suite runs against a fresh `fake-indexeddb` every time, so it never exercises
an upgrade from version 1. Do it once in a real browser: check out the previous
commit, `npm run dev`, import an export so a version-1 database exists, then
return to this branch, reload, and confirm the library still restores and the
console shows no `VersionError`.

- [ ] **Step 7: Commit**

```bash
git add src/services/db.ts src/services/filters.ts tests/services/filters.test.ts
git commit -m "feat(services): persist the active filter criteria"
```

---

### Task 5: The two TMDB detail endpoints

TMDB files films and television separately and the two are not interchangeable:
asking `/movie/{id}` about a series returns nothing at all, and nothing about it
would look like an error.

**Files:**
- Modify: `src/services/tmdb.ts`
- Create: `src/services/tmdbDetailsCache.ts`
- Test: `tests/services/tmdb.test.ts`, `tests/services/tmdbDetailsCache.test.ts`

**Interfaces:**
- Produces:
  - `interface TmdbDetails { genres: string[]; runtimeMinutes: number | null; directors: string[] }`
  - `fetchMovieDetails(tmdbId: number): Promise<TmdbDetails | null>`
  - `fetchTvDetails(tmdbId: number): Promise<TmdbDetails | null>`
  - `getCachedDetails(key: string): Promise<TmdbDetails | null | undefined>`
  - `putCachedDetails(key: string, details: TmdbDetails | null, fetchedAt?: number): Promise<void>`
  - `DETAILS_CACHE_TTL_MS`
- A `null` return means the request failed or TMDB had nothing. A `TmdbDetails`
  with empty arrays means TMDB answered and there is nothing to report — a real
  answer, and a different one.

- [ ] **Step 1: Write the failing endpoint tests**

Append to `tests/services/tmdb.test.ts`, importing `fetchMovieDetails` and
`fetchTvDetails`:

```ts
describe('fetchMovieDetails', () => {
  it('reads genres, runtime, and the crew members who directed', async () => {
    mockFetch({
      genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
      runtime: 170,
      credits: {
        crew: [
          { job: 'Director', name: 'Michael Mann' },
          { job: 'Editor', name: 'Dov Hoenig' },
        ],
      },
    });

    expect(await fetchMovieDetails(949)).toEqual({
      genres: ['Drama', 'Crime'],
      runtimeMinutes: 170,
      directors: ['Michael Mann'],
    });
  });

  it('asks the movie endpoint, with credits appended', async () => {
    const fetchMock = mockFetch({ genres: [], runtime: null, credits: { crew: [] } });
    await fetchMovieDetails(949);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/movie/949');
    expect(url).toContain('append_to_response=credits');
  });

  it('reports an answer of nothing as an answer, not as a failure', async () => {
    // The difference matters: this marks the film as asked-about, and a null
    // would leave the details pass selecting it again on every visit.
    expect(await fetchMovieDetails(949)).not.toBeNull();
    expect(await fetchMovieDetails(949)).toEqual({
      genres: [],
      runtimeMinutes: null,
      directors: [],
    });
  });

  it('reports null when the request fails', async () => {
    mockFetch(null, false);
    expect(await fetchMovieDetails(949)).toBeNull();
  });

  it('treats a zero runtime as no runtime', async () => {
    // TMDB reports 0 for titles nobody has filled in, and a "0 minutes or more"
    // filter bound is not a fact about the film.
    mockFetch({ genres: [], runtime: 0, credits: { crew: [] } });
    expect((await fetchMovieDetails(949))!.runtimeMinutes).toBeNull();
  });
});

describe('fetchTvDetails', () => {
  it('reads genres, episode runtime, and the creators', async () => {
    // A series has no single director. created_by is the honest equivalent, and
    // the interface shows it under the same heading.
    mockFetch({
      genres: [{ id: 18, name: 'Drama' }],
      episode_run_time: [47],
      created_by: [{ name: 'Vince Gilligan' }],
    });

    expect(await fetchTvDetails(1396)).toEqual({
      genres: ['Drama'],
      runtimeMinutes: 47,
      directors: ['Vince Gilligan'],
    });
  });

  it('asks the television endpoint', async () => {
    // Asking /movie about a series returns nothing, and nothing looks exactly
    // like a title with no genres — which is why this is pinned.
    const fetchMock = mockFetch({ genres: [], episode_run_time: [], created_by: [] });
    await fetchTvDetails(1396);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/tv/1396');
  });

  it('reports null when the request fails', async () => {
    mockFetch(null, false);
    expect(await fetchTvDetails(1396)).toBeNull();
  });
});
```

The third `fetchMovieDetails` test above calls it twice against whatever
`mockFetch` was last given; put an explicit
`mockFetch({ genres: [], runtime: null, credits: { crew: [] } });` as its first
line so it does not depend on the previous test's stub.

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/services/tmdb.test.ts
```

Expected: FAIL — neither function is exported.

- [ ] **Step 3: Implement both endpoints**

Append to `src/services/tmdb.ts`:

```ts
/**
 * The metadata neither export carries and `/find` does not return: what the
 * Genre, Director and Runtime sections of the filter rail are made of.
 */
export interface TmdbDetails {
  genres: string[];
  runtimeMinutes: number | null;
  directors: string[];
}

interface TmdbNamed {
  name?: string;
}

interface TmdbMovieDetail {
  genres?: TmdbNamed[];
  runtime?: number | null;
  credits?: { crew?: { job?: string; name?: string }[] };
}

interface TmdbTvDetail {
  genres?: TmdbNamed[];
  episode_run_time?: number[];
  created_by?: TmdbNamed[];
}

function names(values: TmdbNamed[] | undefined): string[] {
  return (values ?? [])
    .map((value) => value.name)
    .filter((name): name is string => typeof name === 'string' && name !== '');
}

/** TMDB reports 0 for a runtime nobody has filled in, which is not a runtime. */
function positiveRuntime(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export async function fetchMovieDetails(tmdbId: number): Promise<TmdbDetails | null> {
  const payload = await getJson(
    `${BASE}/movie/${tmdbId}?api_key=${key()}&append_to_response=credits`,
  );
  if (payload === null) return null;

  const detail = payload as TmdbMovieDetail;
  return {
    genres: names(detail.genres),
    runtimeMinutes: positiveRuntime(detail.runtime),
    directors: names((detail.credits?.crew ?? []).filter((member) => member.job === 'Director')),
  };
}

/**
 * A series has no director field. `created_by` is the closest true equivalent,
 * and the rail shows it under the Director heading rather than inventing a
 * second one for a handful of titles.
 */
export async function fetchTvDetails(tmdbId: number): Promise<TmdbDetails | null> {
  const payload = await getJson(`${BASE}/tv/${tmdbId}?api_key=${key()}`);
  if (payload === null) return null;

  const detail = payload as TmdbTvDetail;
  return {
    genres: names(detail.genres),
    runtimeMinutes: positiveRuntime(detail.episode_run_time?.[0]),
    directors: names(detail.created_by),
  };
}
```

- [ ] **Step 4: Run the endpoint tests**

```bash
npm run test:run -- tests/services/tmdb.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing cache tests**

Create `tests/services/tmdbDetailsCache.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  getCachedDetails,
  putCachedDetails,
  DETAILS_CACHE_TTL_MS,
} from '@/services/tmdbDetailsCache';
import { resetDatabase } from '@/services/db';

beforeEach(async () => {
  await resetDatabase();
});

describe('the details cache', () => {
  it('reports undefined for a title nobody has looked up', async () => {
    expect(await getCachedDetails('movie:949')).toBeUndefined();
  });

  it('round-trips a set of details', async () => {
    const details = { genres: ['Drama'], runtimeMinutes: 170, directors: ['Michael Mann'] };
    await putCachedDetails('movie:949', details);
    expect(await getCachedDetails('movie:949')).toEqual(details);
  });

  it('distinguishes "TMDB had nothing" from "never asked"', async () => {
    await putCachedDetails('movie:1', null);
    expect(await getCachedDetails('movie:1')).toBeNull();
  });

  it('forgets an entry older than the time to live', async () => {
    await putCachedDetails('movie:949', { genres: [], runtimeMinutes: null, directors: [] },
      Date.now() - DETAILS_CACHE_TTL_MS - 1);
    expect(await getCachedDetails('movie:949')).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

```bash
npm run test:run -- tests/services/tmdbDetailsCache.test.ts
```

Expected: FAIL — the module does not exist.

- [ ] **Step 7: Write the cache**

Create `src/services/tmdbDetailsCache.ts`:

```ts
import { db } from './db';
import type { TmdbDetails } from './tmdb';

/** Thirty days, as for posters. Genres and runtimes change less than posters do. */
export const DETAILS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * undefined -> never looked up. null -> looked up, TMDB had nothing.
 * Keys are `movie:{id}` or `tv:{id}`: the same TMDB id can name a film and a
 * series, and the two endpoints answer differently.
 */
export async function getCachedDetails(key: string): Promise<TmdbDetails | null | undefined> {
  const entry = await (await db()).get('tmdbDetails', key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > DETAILS_CACHE_TTL_MS) return undefined;
  return entry.details;
}

export async function putCachedDetails(
  key: string,
  details: TmdbDetails | null,
  fetchedAt: number = Date.now(),
): Promise<void> {
  await (await db()).put('tmdbDetails', { details, fetchedAt }, key);
}
```

- [ ] **Step 8: Run everything and commit**

```bash
npm run test:run && npm run typecheck && npm run lint
git add src/services/tmdb.ts src/services/tmdbDetailsCache.ts tests/services
git commit -m "feat(services): fetch and cache TMDB genres, runtimes and directors"
```

---

### Task 6: The details pass

A second enrichment run, after posters, over every record that has a TMDB id and
no details yet. It reuses the worker-pool shape of `enrichLibrary` rather than
inventing a second concurrency model.

**Files:**
- Create: `src/enrich/enrichDetails.ts`
- Test: `tests/enrich/enrichDetails.test.ts`

**Interfaces:**
- Consumes: `fetchMovieDetails`, `fetchTvDetails`, `TmdbDetails` (Task 5),
  `getCachedDetails`, `putCachedDetails` (Task 5), `Film.detailsFetched` (Task 1).
- Produces:
  - `interface DetailsProgress { films: Film[]; done: number; total: number }`
  - `countPendingDetails(films: Film[]): number`
  - `enrichDetails(films: Film[], onProgress: (p: DetailsProgress) => void, options?: { concurrency?: number }): Promise<Film[]>`

- [ ] **Step 1: Write the failing tests**

Create `tests/enrich/enrichDetails.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { enrichDetails, countPendingDetails } from '@/enrich/enrichDetails';
import { resetDatabase } from '@/services/db';
import { makeFilm } from '../support/film';

const fetchMovieDetails = vi.fn();
const fetchTvDetails = vi.fn();

vi.mock('@/services/tmdb', () => ({
  fetchMovieDetails: (id: number) => fetchMovieDetails(id) as unknown,
  fetchTvDetails: (id: number) => fetchTvDetails(id) as unknown,
}));

beforeEach(async () => {
  await resetDatabase();
  fetchMovieDetails.mockReset();
  fetchTvDetails.mockReset();
  fetchMovieDetails.mockResolvedValue({ genres: ['Drama'], runtimeMinutes: 170, directors: ['Michael Mann'] });
  fetchTvDetails.mockResolvedValue({ genres: ['Crime'], runtimeMinutes: 47, directors: ['Vince Gilligan'] });
});

describe('countPendingDetails', () => {
  it('counts only films with a TMDB id and no details yet', () => {
    const films = [
      makeFilm({ title: 'has id', tmdbId: 1 }),
      makeFilm({ title: 'already done', tmdbId: 2, detailsFetched: true }),
      makeFilm({ title: 'never matched', tmdbId: null }),
    ];
    expect(countPendingDetails(films)).toBe(1);
  });
});

describe('enrichDetails', () => {
  it('fills in genres, runtime and directors, and marks the film as asked about', async () => {
    const films = [makeFilm({ title: 'Heat', tmdbId: 949 })];
    const enriched = await enrichDetails(films, () => {});

    expect(enriched[0]).toMatchObject({
      genres: ['Drama'],
      runtimeMinutes: 170,
      directors: ['Michael Mann'],
      detailsFetched: true,
    });
  });

  it('asks the television endpoint for a series', async () => {
    // Asking /movie about a series returns nothing, and a library of series
    // would end up with no genres at all and no error to show for it.
    const films = [makeFilm({ title: 'Breaking Bad', tmdbId: 1396, titleType: 'series' })];
    const enriched = await enrichDetails(films, () => {});

    expect(fetchTvDetails).toHaveBeenCalledWith(1396);
    expect(fetchMovieDetails).not.toHaveBeenCalled();
    expect(enriched[0]!.genres).toEqual(['Crime']);
  });

  it('asks the television endpoint for a mini-series too', async () => {
    await enrichDetails([makeFilm({ title: 'Chernobyl', tmdbId: 87108, titleType: 'miniSeries' })], () => {});
    expect(fetchTvDetails).toHaveBeenCalledWith(87108);
  });

  it('asks the movie endpoint for a TV film', async () => {
    // TMDB files television films under /movie; only ongoing television is /tv.
    await enrichDetails([makeFilm({ title: 'Duel', tmdbId: 11040, titleType: 'tvMovie' })], () => {});
    expect(fetchMovieDetails).toHaveBeenCalledWith(11040);
  });

  it('marks a film as asked about even when TMDB answered with nothing', async () => {
    fetchMovieDetails.mockResolvedValue({ genres: [], runtimeMinutes: null, directors: [] });
    const enriched = await enrichDetails([makeFilm({ title: 'Obscure', tmdbId: 7 })], () => {});
    expect(enriched[0]!.detailsFetched).toBe(true);
    expect(enriched[0]!.genres).toEqual([]);
  });

  it('leaves a film unmarked when the lookup failed, so a later visit retries', async () => {
    fetchMovieDetails.mockResolvedValue(null);
    const enriched = await enrichDetails([makeFilm({ title: 'Offline', tmdbId: 7 })], () => {});
    expect(enriched[0]!.detailsFetched).toBe(false);
  });

  it('never displaces what the export already supplied', async () => {
    // An IMDb export carries genres and runtime the user can see in their own
    // file. TMDB does not get to overrule it.
    const films = [
      makeFilm({ title: 'Heat', tmdbId: 949, genres: ['Thriller'], runtimeMinutes: 165 }),
    ];
    const enriched = await enrichDetails(films, () => {});
    expect(enriched[0]!.genres).toEqual(['Thriller']);
    expect(enriched[0]!.runtimeMinutes).toBe(165);
    expect(enriched[0]!.directors).toEqual(['Michael Mann']);
  });

  it('skips films with no TMDB id and does not count them in the total', async () => {
    const progress: number[] = [];
    const films = [makeFilm({ title: 'no id', tmdbId: null }), makeFilm({ title: 'Heat', tmdbId: 949 })];

    await enrichDetails(films, (p) => progress.push(p.total));

    expect(fetchMovieDetails).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([1]);
  });

  it('asks TMDB once for a title it already looked up', async () => {
    await enrichDetails([makeFilm({ title: 'Heat', tmdbId: 949 })], () => {});
    await enrichDetails([makeFilm({ title: 'Heat again', tmdbId: 949 })], () => {});
    expect(fetchMovieDetails).toHaveBeenCalledTimes(1);
  });

  it('reports progress once per film, in order', async () => {
    const seen: { done: number; total: number }[] = [];
    const films = [
      makeFilm({ title: 'a', tmdbId: 1 }),
      makeFilm({ title: 'b', tmdbId: 2 }),
      makeFilm({ title: 'c', tmdbId: 3 }),
    ];

    await enrichDetails(films, (p) => seen.push({ done: p.done, total: p.total }), { concurrency: 1 });

    expect(seen).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/enrich/enrichDetails.test.ts
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the pass**

Create `src/enrich/enrichDetails.ts`:

```ts
import type { Film } from '@/domain/film';
import type { TitleType } from '@/domain/titleType';
import { fetchMovieDetails, fetchTvDetails, type TmdbDetails } from '@/services/tmdb';
import { getCachedDetails, putCachedDetails } from '@/services/tmdbDetailsCache';

export interface DetailsProgress {
  films: Film[];
  done: number;
  total: number;
}

/** Same as the poster pass: six at a time. */
const DEFAULT_CONCURRENCY = 6;

/**
 * The kinds TMDB files under /tv. Everything else — films, television films,
 * shorts, and anything we could not classify — is a /movie.
 *
 * Episodes are absent on purpose: `lookupByImdbId` reads `movie_results` and
 * `tv_results` only, so an episode never comes back with a tmdbId and never
 * reaches this pass at all.
 */
const TELEVISION: ReadonlySet<TitleType> = new Set<TitleType>(['series', 'miniSeries']);

function needsDetails(film: Film): boolean {
  return film.tmdbId !== null && !film.detailsFetched;
}

/** How much work the pass has to do, so the interface can say so before it starts. */
export function countPendingDetails(films: Film[]): number {
  return films.filter(needsDetails).length;
}

async function resolveDetails(film: Film): Promise<TmdbDetails | null> {
  const tmdbId = film.tmdbId;
  if (tmdbId === null) return null;

  const kind = TELEVISION.has(film.titleType) ? 'tv' : 'movie';
  // The same numeric id names a different title in each of TMDB's two
  // catalogues, so the kind is part of the key rather than a detail of it.
  const key = `${kind}:${tmdbId}`;

  const cached = await getCachedDetails(key);
  if (cached !== undefined) return cached;

  const details = kind === 'tv' ? await fetchTvDetails(tmdbId) : await fetchMovieDetails(tmdbId);
  await putCachedDetails(key, details);
  return details;
}

/**
 * Apply what TMDB said without ever displacing what the user's own export
 * supplied — the same rule the poster pass follows.
 *
 * A null means the request failed, and the film stays unmarked so a later visit
 * tries again. An answer of nothing still marks it: "asked, and there are none"
 * is a real answer, and it is what lets the rail tell an empty genre list from
 * an unasked question.
 */
function applyDetails(film: Film, details: TmdbDetails | null): Film {
  if (!details) return film;
  return {
    ...film,
    genres: film.genres.length > 0 ? film.genres : details.genres,
    directors: film.directors.length > 0 ? film.directors : details.directors,
    runtimeMinutes: film.runtimeMinutes ?? details.runtimeMinutes,
    detailsFetched: true,
  };
}

/**
 * Fill in genres, directors and runtimes for every film that has a TMDB id and
 * no details yet.
 *
 * Unlike the poster pass this does not re-merge the library: it adds no
 * identifier, so it cannot reveal that two records were the same film.
 */
export async function enrichDetails(
  films: Film[],
  onProgress: (progress: DetailsProgress) => void,
  options: { concurrency?: number } = {},
): Promise<Film[]> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const enriched = [...films];
  const pending = films
    .map((film, index) => ({ film, index }))
    .filter(({ film }) => needsDetails(film));

  const total = pending.length;
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < pending.length) {
      const entry = pending[next++]!;
      enriched[entry.index] = applyDetails(entry.film, await resolveDetails(entry.film));
      done += 1;
      onProgress({ films: [...enriched], done, total });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));

  return enriched;
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npm run test:run -- tests/enrich/enrichDetails.test.ts && npm run typecheck && npm run lint
```

Expected: PASS, clean.

- [ ] **Step 5: Prove the endpoint test can fail**

Change `TELEVISION.has(film.titleType) ? 'tv' : 'movie'` to always `'movie'`, run
the file, confirm the series and mini-series tests go red, then restore it.

- [ ] **Step 6: Commit**

```bash
git add src/enrich/enrichDetails.ts tests/enrich/enrichDetails.test.ts
git commit -m "feat(enrich): fetch the metadata Letterboxd exports leave out"
```

---

### Task 7: The rail's building blocks, and the first three sections

**Files:**
- Create: `src/ui/filters/fields.tsx`
- Create: `src/ui/filters/CheckboxList.tsx`
- Create: `src/ui/filters/FilterSection.tsx`
- Create: `src/ui/filters/FilterControls.tsx`
- Test: `tests/ui/filters/FilterSection.test.tsx`, `tests/ui/filters/FilterControls.test.tsx`

**Interfaces:**
- Consumes: `FilterCriteria`, `availableTitleTypes`, `availableDecades` (Tasks 2
  and existing), `TITLE_TYPE_LABELS`.
- Produces:
  - `NumberField`, `CheckField`, `DateField` from `fields.tsx`
  - `CheckboxList<T extends string | number>` from `CheckboxList.tsx`
  - `FilterSection` from `FilterSection.tsx`
  - `RatingControls`, `EraControls`, `TypeControls` from `FilterControls.tsx`,
    each taking `{ films: Film[]; criteria: FilterCriteria; onChange: (next: FilterCriteria) => void }`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/filters/FilterSection.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterSection } from '@/ui/filters/FilterSection';

describe('FilterSection', () => {
  it('shows how many titles its own criteria admit', () => {
    render(
      <FilterSection title="Rating" count={143} total={400}>
        <p>controls</p>
      </FilterSection>,
    );
    expect(screen.getByText('143 / 400')).toBeInTheDocument();
  });

  it('shows the plain total when the section admits everything', () => {
    render(
      <FilterSection title="Rating" count={400} total={400}>
        <p>controls</p>
      </FilterSection>,
    );
    expect(screen.getByText('400')).toBeInTheDocument();
  });

  it('is a real disclosure, open or closed by request', () => {
    // A div that only looks clickable is unreachable by keyboard and invisible
    // to a screen reader. <details> is neither.
    const { container } = render(
      <FilterSection title="Rating" count={1} total={1} defaultOpen>
        <p>controls</p>
      </FilterSection>,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details).toHaveAttribute('open');
    expect(container.querySelector('summary')).toHaveTextContent('Rating');
  });

  it('replaces its controls with the reason when it cannot be used yet', () => {
    render(
      <FilterSection title="Genre" count={0} total={0} disabled disabledNote="Still loading 120 titles">
        <p>controls</p>
      </FilterSection>,
    );
    expect(screen.getByText('Still loading 120 titles')).toBeInTheDocument();
    expect(screen.queryByText('controls')).not.toBeInTheDocument();
  });

  it('names its own group for a screen reader', () => {
    render(
      <FilterSection title="Rating" count={1} total={1} defaultOpen>
        <p>controls</p>
      </FilterSection>,
    );
    expect(screen.getByRole('group', { name: 'Rating' })).toBeInTheDocument();
  });
});
```

Create `tests/ui/filters/FilterControls.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RatingControls, EraControls, TypeControls } from '@/ui/filters/FilterControls';
import { makeFilm } from '../../support/film';

const library = [
  makeFilm({ title: 'Heat', year: 1995, titleType: 'movie' }),
  makeFilm({ title: 'Blade Runner', year: 1982, titleType: 'movie' }),
  makeFilm({ title: 'Breaking Bad', year: 2008, titleType: 'series' }),
];

describe('RatingControls', () => {
  it('sets a minimum', () => {
    const onChange = vi.fn();
    render(<RatingControls films={library} criteria={{}} onChange={onChange} />);

    // fireEvent, not userEvent.type: these inputs are controlled by a criteria
    // object the test never updates, so typing "80" would deliver "8" and then
    // "0" and the assertion would be about the last character rather than the
    // number. One change event carries the whole value.
    fireEvent.change(screen.getByLabelText('Minimum rating'), { target: { value: '80' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minRating: 80 }));
  });

  it('clears a bound when the box is emptied, rather than setting it to zero', async () => {
    // Number('') is 0, and a silent "rating 0 or more" is a filter nobody asked
    // for that quietly excludes every unrated title.
    const onChange = vi.fn();
    render(<RatingControls films={library} criteria={{ minRating: 80 }} onChange={onChange} />);

    await userEvent.clear(screen.getByLabelText('Minimum rating'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minRating: undefined }));
  });

  it('stores a below-the-public-score bound as a negative delta', () => {
    const onChange = vi.fn();
    render(<RatingControls films={library} criteria={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Below the public score by at least'), {
      target: { value: '10' },
    });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxRatingDelta: -10 }));
  });

  it('toggles unrated only', async () => {
    const onChange = vi.fn();
    render(<RatingControls films={library} criteria={{}} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Only unrated titles'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ onlyUnrated: true }));
  });
});

describe('EraControls', () => {
  it('offers only the decades the library holds', () => {
    render(<EraControls films={library} criteria={{}} onChange={vi.fn()} />);

    expect(screen.getByLabelText('1980s')).toBeInTheDocument();
    expect(screen.getByLabelText('1990s')).toBeInTheDocument();
    expect(screen.getByLabelText('2000s')).toBeInTheDocument();
    expect(screen.queryByLabelText('1970s')).not.toBeInTheDocument();
  });

  it('adds and removes a decade', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<EraControls films={library} criteria={{}} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('1990s'));
    expect(onChange).toHaveBeenLastCalledWith({ decades: [1990] });

    rerender(<EraControls films={library} criteria={{ decades: [1990] }} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('1990s'));
    expect(onChange).toHaveBeenLastCalledWith({ decades: [] });
  });
});

describe('TypeControls', () => {
  it('offers only the kinds of title present, named in the plural', () => {
    render(<TypeControls films={library} criteria={{}} onChange={vi.fn()} />);

    expect(screen.getByLabelText('films')).toBeInTheDocument();
    expect(screen.getByLabelText('series')).toBeInTheDocument();
    expect(screen.queryByLabelText('episodes')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/ui/filters
```

Expected: FAIL — none of the modules exist.

- [ ] **Step 3: Write the field primitives**

Create `src/ui/filters/fields.tsx`:

```tsx
interface NumberFieldProps {
  label: string;
  value: number | undefined;
  min?: number;
  max?: number;
  onChange: (value: number | undefined) => void;
}

const FIELD_ROW = 'flex items-center justify-between gap-2 text-sm text-ink-dim';
const INPUT =
  'w-24 rounded-card border border-line bg-surface-raised px-2 py-1 text-ink focus:outline-none focus:ring-2 focus:ring-accent';

export function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <label className={FIELD_ROW}>
      <span>{label}</span>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        onChange={(event) => {
          const raw = event.target.value;
          // An empty box means "no bound". Number('') is 0, which would apply a
          // filter nobody asked for.
          onChange(raw === '' ? undefined : Number(raw));
        }}
        className={INPUT}
      />
    </label>
  );
}

interface CheckFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckField({ label, checked, onChange }: CheckFieldProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-dim">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent"
      />
      <span>{label}</span>
    </label>
  );
}

/** `<input type="date">` speaks ISO calendar dates in the reader's own zone. */
function toInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

interface DateFieldProps {
  label: string;
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
}

export function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <label className={FIELD_ROW}>
      <span>{label}</span>
      <input
        type="date"
        value={value ? toInputValue(value) : ''}
        onChange={(event) => {
          const raw = event.target.value;
          // Parsed as local midnight, matching how it was rendered. `new
          // Date('2024-01-31')` alone is UTC midnight, which is the previous
          // day for most of the world.
          onChange(raw === '' ? undefined : new Date(`${raw}T00:00:00`));
        }}
        className={INPUT}
      />
    </label>
  );
}
```

- [ ] **Step 4: Write the checkbox list**

Create `src/ui/filters/CheckboxList.tsx`:

```tsx
interface CheckboxListProps<T extends string | number> {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}

/** A set of values chosen from a list. The list only ever holds what the library holds. */
export function CheckboxList<T extends string | number>({
  options,
  selected,
  onChange,
}: CheckboxListProps<T>) {
  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto">
      {options.map((option) => (
        <li key={String(option.value)}>
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((value) => value !== option.value),
                )
              }
              className="accent-accent"
            />
            <span>{option.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Write the section wrapper**

Create `src/ui/filters/FilterSection.tsx`:

```tsx
import type { ReactNode } from 'react';

interface FilterSectionProps {
  title: string;
  /** How many titles this section's own criteria admit, of the whole library. */
  count: number;
  total: number;
  defaultOpen?: boolean;
  disabled?: boolean;
  /** Why the section cannot be used yet. Shown in place of its controls. */
  disabledNote?: string;
  children: ReactNode;
}

/**
 * One collapsible group of controls, headed by the number of titles it admits
 * on its own — so a reader with eleven criteria set can see which one is doing
 * the cutting.
 *
 * A real <details>/<summary>, not a div that looks clickable: the disclosure has
 * to be reachable by keyboard and announced as one.
 */
export function FilterSection({
  title,
  count,
  total,
  defaultOpen = false,
  disabled = false,
  disabledNote,
  children,
}: FilterSectionProps) {
  return (
    <details open={defaultOpen} className="rounded-card border border-line bg-surface">
      <summary className="flex cursor-pointer items-baseline justify-between gap-2 px-3 py-2 font-display text-sm uppercase tracking-widest text-ink">
        <span>{title}</span>
        <span className="text-xs text-ink-dim">
          {count === total ? total : `${count} / ${total}`}
        </span>
      </summary>
      <fieldset disabled={disabled} className="space-y-2 px-3 pb-3 disabled:opacity-60">
        <legend className="sr-only">{title}</legend>
        {disabled && disabledNote ? (
          <p className="text-xs text-ink-dim">{disabledNote}</p>
        ) : (
          children
        )}
      </fieldset>
    </details>
  );
}
```

- [ ] **Step 6: Write the first three groups of controls**

Create `src/ui/filters/FilterControls.tsx`:

```tsx
import { CheckboxList } from './CheckboxList';
import { CheckField, NumberField } from './fields';
import { availableDecades, availableTitleTypes, type FilterCriteria } from '@/domain/filters';
import { TITLE_TYPE_LABELS } from '@/domain/titleType';
import type { Film } from '@/domain/film';

export interface ControlsProps {
  films: Film[];
  criteria: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
}

export function RatingControls({ criteria, onChange }: ControlsProps) {
  return (
    <>
      <NumberField
        label="Minimum rating"
        value={criteria.minRating}
        min={0}
        max={100}
        onChange={(value) => onChange({ ...criteria, minRating: value })}
      />
      <NumberField
        label="Maximum rating"
        value={criteria.maxRating}
        min={0}
        max={100}
        onChange={(value) => onChange({ ...criteria, maxRating: value })}
      />
      <CheckField
        label="Only unrated titles"
        checked={criteria.onlyUnrated ?? false}
        onChange={(checked) => onChange({ ...criteria, onlyUnrated: checked })}
      />
      <NumberField
        label="Above the public score by at least"
        value={criteria.minRatingDelta}
        min={0}
        max={100}
        onChange={(value) => onChange({ ...criteria, minRatingDelta: value })}
      />
      <NumberField
        label="Below the public score by at least"
        // Stored as a negative delta — "at most -10" is the predicate — but a
        // reader setting "10 below" should type 10, not -10.
        value={criteria.maxRatingDelta === undefined ? undefined : Math.abs(criteria.maxRatingDelta)}
        min={0}
        max={100}
        onChange={(value) =>
          onChange({ ...criteria, maxRatingDelta: value === undefined ? undefined : -value })
        }
      />
      <p className="text-xs text-ink-dim">
        Ratings are on one 0–100 scale, whichever service they came from.
      </p>
    </>
  );
}

export function EraControls({ films, criteria, onChange }: ControlsProps) {
  const options = availableDecades(films).map((decade) => ({
    value: decade,
    label: `${decade}s`,
  }));

  return (
    <CheckboxList
      options={options}
      selected={criteria.decades ?? []}
      onChange={(decades) => onChange({ ...criteria, decades })}
    />
  );
}

export function TypeControls({ films, criteria, onChange }: ControlsProps) {
  const options = availableTitleTypes(films)
    .map((type) => ({ value: type, label: TITLE_TYPE_LABELS[type].many }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <CheckboxList
      options={options}
      selected={criteria.titleTypes ?? []}
      onChange={(titleTypes) => onChange({ ...criteria, titleTypes })}
    />
  );
}
```

- [ ] **Step 7: Run the tests and watch them pass**

```bash
npm run test:run -- tests/ui/filters && npm run typecheck && npm run lint
```

Expected: PASS, clean. Every control here is controlled by a `criteria` object
its own `onChange` does not update, so a text entry has to arrive as one change
event; that is why the number fields are driven with `fireEvent.change` and only
the checkboxes with `userEvent.click`.

- [ ] **Step 8: Commit**

```bash
git add src/ui/filters tests/ui/filters
git commit -m "feat(ui): add the filter rail's sections and its first controls"
```

---

### Task 8: The remaining five groups of controls

**Files:**
- Modify: `src/ui/filters/FilterControls.tsx`
- Test: `tests/ui/filters/FilterControls.test.tsx`

**Interfaces:**
- Consumes: `ControlsProps`, `CheckboxList`, `NumberField`, `CheckField`,
  `DateField` (Task 7); `availableGenres`, `availableDirectors`, `runtimeBounds`.
- Produces: `GenreControls`, `DirectorControls`, `RuntimeControls`,
  `WatchedControls`, `TopNControls` — same `ControlsProps` shape as Task 7's.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/filters/FilterControls.test.tsx`:

```tsx
import {
  GenreControls,
  DirectorControls,
  RuntimeControls,
  WatchedControls,
  TopNControls,
} from '@/ui/filters/FilterControls';

const detailed = [
  makeFilm({ title: 'Heat', genres: ['Crime'], directors: ['Michael Mann'], runtimeMinutes: 170 }),
  makeFilm({ title: 'Solaris', genres: ['Drama'], directors: ['Andrei Tarkovsky'], runtimeMinutes: 167 }),
];

describe('GenreControls', () => {
  it('offers only the genres the library holds', () => {
    render(<GenreControls films={detailed} criteria={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Crime')).toBeInTheDocument();
    expect(screen.queryByLabelText('Western')).not.toBeInTheDocument();
  });
});

describe('DirectorControls', () => {
  const many = Array.from({ length: 60 }, (_, index) =>
    makeFilm({ title: `Film ${index}`, directors: [`Director ${String(index).padStart(2, '0')}`] }),
  );

  it('narrows the list as you search', async () => {
    render(<DirectorControls films={detailed} criteria={{}} onChange={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Search directors'), 'tark');

    expect(screen.getByLabelText('Andrei Tarkovsky')).toBeInTheDocument();
    expect(screen.queryByLabelText('Michael Mann')).not.toBeInTheDocument();
  });

  it('says how many names it is not showing, rather than truncating in silence', () => {
    render(<DirectorControls films={many} criteria={{}} onChange={vi.fn()} />);
    expect(screen.getByText(/Showing 50 of 60/)).toBeInTheDocument();
  });

  it('keeps a chosen director on screen even when the search would hide them', async () => {
    // Otherwise a filter can be set and then become impossible to unset from
    // the control that set it.
    render(
      <DirectorControls films={detailed} criteria={{ directors: ['Michael Mann'] }} onChange={vi.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Search directors'), 'tark');

    expect(screen.getByLabelText('Michael Mann')).toBeChecked();
  });
});

describe('RuntimeControls', () => {
  it('says what the library spans, so the bounds mean something', () => {
    render(<RuntimeControls films={detailed} criteria={{}} onChange={vi.fn()} />);
    expect(screen.getByText(/167 to 170 minutes/)).toBeInTheDocument();
  });

  it('sets a minimum', () => {
    const onChange = vi.fn();
    render(<RuntimeControls films={detailed} criteria={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Shortest'), { target: { value: '90' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minRuntimeMinutes: 90 }));
  });
});

describe('WatchedControls', () => {
  it('sets a date at local midnight, not the previous evening', () => {
    // new Date('2024-01-31') is UTC midnight, which is 31 January only for
    // readers east of Greenwich.
    const onChange = vi.fn();
    render(<WatchedControls films={detailed} criteria={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Watched after'), { target: { value: '2024-01-31' } });

    const [[next]] = onChange.mock.calls.slice(-1) as [[{ watchedAfter: Date }]];
    expect(next.watchedAfter.getFullYear()).toBe(2024);
    expect(next.watchedAfter.getMonth()).toBe(0);
    expect(next.watchedAfter.getDate()).toBe(31);
  });

  it('toggles rewatches only', async () => {
    const onChange = vi.fn();
    render(<WatchedControls films={detailed} criteria={{}} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Only rewatches'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ onlyRewatches: true }));
  });
});

describe('TopNControls', () => {
  it('keeps only the highest rated N', () => {
    const onChange = vi.fn();
    render(<TopNControls films={detailed} criteria={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Keep the top'), { target: { value: '25' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ topN: 25 }));
  });
});
```

Merge the new import into the existing one from `@/ui/filters/FilterControls`
rather than adding a second import statement.

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/ui/filters/FilterControls.test.tsx
```

Expected: FAIL — the five components do not exist.

- [ ] **Step 3: Implement them**

Append to `src/ui/filters/FilterControls.tsx`, and extend its imports with
`useState` from `react`, `DateField` from `./fields`, and `availableGenres`,
`availableDirectors`, `runtimeBounds` from `@/domain/filters`:

```tsx
export function GenreControls({ films, criteria, onChange }: ControlsProps) {
  const options = availableGenres(films).map((genre) => ({ value: genre, label: genre }));

  return (
    <CheckboxList
      options={options}
      selected={criteria.genres ?? []}
      onChange={(genres) => onChange({ ...criteria, genres })}
    />
  );
}

/** A big library holds hundreds of directors; a list that long is not a control. */
const DIRECTOR_LIMIT = 50;

export function DirectorControls({ films, criteria, onChange }: ControlsProps) {
  const [query, setQuery] = useState('');
  const selected = criteria.directors ?? [];

  const needle = query.trim().toLowerCase();
  const matching =
    needle === ''
      ? availableDirectors(films)
      : availableDirectors(films).filter((name) => name.toLowerCase().includes(needle));
  const shown = matching.slice(0, DIRECTOR_LIMIT);

  // Anything already chosen stays on screen whatever the search says, so a
  // filter can always be undone from the control that set it.
  const options = [...new Set([...selected, ...shown])].map((name) => ({
    value: name,
    label: name,
  }));

  return (
    <>
      <input
        type="search"
        value={query}
        aria-label="Search directors"
        placeholder="Search directors"
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-card border border-line bg-surface-raised px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <CheckboxList
        options={options}
        selected={selected}
        onChange={(directors) => onChange({ ...criteria, directors })}
      />
      {matching.length > shown.length && (
        <p className="text-xs text-ink-dim">
          Showing {shown.length} of {matching.length}. Type to narrow the list.
        </p>
      )}
    </>
  );
}

export function RuntimeControls({ films, criteria, onChange }: ControlsProps) {
  const bounds = runtimeBounds(films);

  return (
    <>
      <NumberField
        label="Shortest"
        value={criteria.minRuntimeMinutes}
        min={0}
        onChange={(value) => onChange({ ...criteria, minRuntimeMinutes: value })}
      />
      <NumberField
        label="Longest"
        value={criteria.maxRuntimeMinutes}
        min={0}
        onChange={(value) => onChange({ ...criteria, maxRuntimeMinutes: value })}
      />
      <p className="text-xs text-ink-dim">
        {bounds
          ? `This library runs ${bounds.min} to ${bounds.max} minutes.`
          : 'No runtimes known yet.'}
      </p>
    </>
  );
}

export function WatchedControls({ criteria, onChange }: ControlsProps) {
  return (
    <>
      <DateField
        label="Watched after"
        value={criteria.watchedAfter}
        onChange={(value) => onChange({ ...criteria, watchedAfter: value })}
      />
      <DateField
        label="Watched before"
        value={criteria.watchedBefore}
        onChange={(value) => onChange({ ...criteria, watchedBefore: value })}
      />
      <CheckField
        label="Only rewatches"
        checked={criteria.onlyRewatches ?? false}
        onChange={(checked) => onChange({ ...criteria, onlyRewatches: checked })}
      />
      <p className="text-xs text-ink-dim">
        IMDb exports carry the date you rated a title, not the date you watched it.
      </p>
    </>
  );
}

export function TopNControls({ criteria, onChange }: ControlsProps) {
  return (
    <>
      <NumberField
        label="Keep the top"
        value={criteria.topN}
        min={1}
        onChange={(value) => onChange({ ...criteria, topN: value })}
      />
      <p className="text-xs text-ink-dim">Applied last, after every other filter.</p>
    </>
  );
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npm run test:run -- tests/ui/filters && npm run typecheck && npm run lint
```

Expected: PASS, clean.

- [ ] **Step 5: Prove the director cap is really a cap**

Raise `DIRECTOR_LIMIT` to 500, run the file, confirm the "Showing 50 of 60" test
goes red, restore it.

- [ ] **Step 6: Commit**

```bash
git add src/ui/filters/FilterControls.tsx tests/ui/filters/FilterControls.test.tsx
git commit -m "feat(ui): add the genre, director, runtime, watched and top-N controls"
```

---

### Task 9: The rail

**Files:**
- Create: `src/ui/filters/FilterRail.tsx`
- Test: `tests/ui/filters/FilterRail.test.tsx`

**Interfaces:**
- Consumes: every `*Controls` from Tasks 7 and 8, `FilterSection`,
  `applyFilters`, `subsetCriteria`, `CriterionKey`.
- Produces: `FilterRail` taking
  `{ films: Film[]; criteria: FilterCriteria; onChange: (next: FilterCriteria) => void; fetchingDetails: { done: number; total: number } | null }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/filters/FilterRail.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterRail } from '@/ui/filters/FilterRail';
import { makeFilm } from '../../support/film';

const library = [
  makeFilm({ title: 'Heat', year: 1995, rating: 90, genres: ['Crime'] }),
  makeFilm({ title: 'Blade Runner', year: 1982, rating: 70, genres: ['Science fiction'] }),
  makeFilm({ title: 'Breaking Bad', year: 2008, rating: 95, titleType: 'series' }),
];

/**
 * The section's fieldset, found through its summary.
 *
 * Not getByRole('group'): five of the eight sections start closed, and content
 * inside a closed <details> is out of the accessibility tree, so a role query
 * would find nothing and the test would fail for a reason that has nothing to
 * do with disabling.
 */
function fieldsetOf(title: string): HTMLFieldSetElement {
  return screen.getByText(title).closest('details')!.querySelector('fieldset')!;
}

describe('FilterRail', () => {
  it('shows all eight sections', () => {
    render(<FilterRail films={library} criteria={{}} onChange={vi.fn()} fetchingDetails={null} />);

    for (const title of ['Rating', 'Era', 'Type', 'Genre', 'Director', 'Runtime', 'Watched', 'Top N']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('opens the first three and leaves the rest closed', () => {
    const { container } = render(
      <FilterRail films={library} criteria={{}} onChange={vi.fn()} fetchingDetails={null} />,
    );
    const open = [...container.querySelectorAll('details')].map((element) => element.hasAttribute('open'));
    expect(open).toEqual([true, true, true, false, false, false, false, false]);
  });

  it('counts each section by its own criteria alone, not by all of them', () => {
    // minRating 90 admits two; the Era section is told about 1990s only, which
    // admits one. If a section counted the whole criteria object, both headers
    // would read the same number and neither would say which one cut what.
    render(
      <FilterRail
        films={library}
        criteria={{ minRating: 90, decades: [1990] }}
        onChange={vi.fn()}
        fetchingDetails={null}
      />,
    );

    expect(screen.getByText('Rating').closest('summary')).toHaveTextContent('2 / 3');
    expect(screen.getByText('Era').closest('summary')).toHaveTextContent('1 / 3');
  });

  it('disables the metadata sections while the details pass is still running', () => {
    render(
      <FilterRail
        films={library}
        criteria={{}}
        onChange={vi.fn()}
        fetchingDetails={{ done: 40, total: 120 }}
      />,
    );

    expect(screen.getByText('Looking up genres and directors… 80 to go')).toBeInTheDocument();
    // Only those three: nothing about the rating or the year needs TMDB.
    expect(screen.getAllByText(/Looking up genres and directors/)).toHaveLength(3);
    expect(fieldsetOf('Genre')).toBeDisabled();
    expect(fieldsetOf('Rating')).not.toBeDisabled();
  });

  it('enables the metadata sections once the pass has finished', () => {
    render(<FilterRail films={library} criteria={{}} onChange={vi.fn()} fetchingDetails={null} />);
    expect(fieldsetOf('Genre')).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/ui/filters/FilterRail.test.tsx
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the rail**

Create `src/ui/filters/FilterRail.tsx`:

```tsx
import { FilterSection } from './FilterSection';
import {
  RatingControls,
  EraControls,
  TypeControls,
  GenreControls,
  DirectorControls,
  RuntimeControls,
  WatchedControls,
  TopNControls,
  type ControlsProps,
} from './FilterControls';
import { applyFilters, subsetCriteria, type CriterionKey, type FilterCriteria } from '@/domain/filters';
import type { Film } from '@/domain/film';
import type { ReactNode } from 'react';

interface SectionSpec {
  title: string;
  /** The criteria this section owns — what its own count is computed from. */
  keys: readonly CriterionKey[];
  open: boolean;
  /** True for the three sections whose options come from the details pass. */
  needsDetails?: boolean;
  Controls: (props: ControlsProps) => ReactNode;
}

const SECTIONS: readonly SectionSpec[] = [
  {
    title: 'Rating',
    keys: ['minRating', 'maxRating', 'onlyUnrated', 'minRatingDelta', 'maxRatingDelta'],
    open: true,
    Controls: RatingControls,
  },
  { title: 'Era', keys: ['decades'], open: true, Controls: EraControls },
  { title: 'Type', keys: ['titleTypes'], open: true, Controls: TypeControls },
  { title: 'Genre', keys: ['genres'], open: false, needsDetails: true, Controls: GenreControls },
  {
    title: 'Director',
    keys: ['directors'],
    open: false,
    needsDetails: true,
    Controls: DirectorControls,
  },
  {
    title: 'Runtime',
    keys: ['minRuntimeMinutes', 'maxRuntimeMinutes'],
    open: false,
    needsDetails: true,
    Controls: RuntimeControls,
  },
  {
    title: 'Watched',
    keys: ['watchedAfter', 'watchedBefore', 'onlyRewatches'],
    open: false,
    Controls: WatchedControls,
  },
  { title: 'Top N', keys: ['topN'], open: false, Controls: TopNControls },
];

interface FilterRailProps {
  films: Film[];
  criteria: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
  /** Non-null while genres, directors and runtimes are still arriving. */
  fetchingDetails: { done: number; total: number } | null;
}

export function FilterRail({ films, criteria, onChange, fetchingDetails }: FilterRailProps) {
  const remaining = fetchingDetails ? fetchingDetails.total - fetchingDetails.done : 0;
  const note = `Looking up genres and directors… ${remaining} to go`;

  return (
    <div className="space-y-2">
      {SECTIONS.map(({ title, keys, open, needsDetails, Controls }) => (
        <FilterSection
          key={title}
          title={title}
          // Each section's own share of the criteria, so the header says what
          // this section is cutting rather than what the rail is cutting.
          count={applyFilters(films, subsetCriteria(criteria, keys)).length}
          total={films.length}
          defaultOpen={open}
          disabled={Boolean(needsDetails && fetchingDetails)}
          disabledNote={note}
        >
          <Controls films={films} criteria={criteria} onChange={onChange} />
        </FilterSection>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npm run test:run -- tests/ui/filters && npm run typecheck && npm run lint
```

Expected: PASS, clean.

- [ ] **Step 5: Prove the per-section count is really per-section**

Change `subsetCriteria(criteria, keys)` to `criteria`, run the file, confirm the
counting test goes red, then restore it.

- [ ] **Step 6: Commit**

```bash
git add src/ui/filters/FilterRail.tsx tests/ui/filters/FilterRail.test.tsx
git commit -m "feat(ui): assemble the filter rail from its sections"
```

---

### Task 10: The count, the chips, and the screen for when nothing passes

**Files:**
- Create: `src/ui/filters/FilterStatus.tsx`
- Create: `src/ui/filters/NoResults.tsx`
- Test: `tests/ui/filters/FilterStatus.test.tsx`, `tests/ui/filters/NoResults.test.tsx`

**Interfaces:**
- Consumes: `activeCriteria`, `describeCriterion`, `withoutCriterion`,
  `mostRestrictiveCriterion` (Task 3).
- Produces:
  - `FilterStatus` taking `{ films: Film[]; visible: Film[]; criteria: FilterCriteria; onChange: (next: FilterCriteria) => void }`
  - `NoResults` taking `{ films: Film[]; criteria: FilterCriteria; onChange: (next: FilterCriteria) => void }`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/filters/FilterStatus.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterStatus } from '@/ui/filters/FilterStatus';
import { makeFilm } from '../../support/film';

const library = [
  makeFilm({ title: 'Heat', rating: 90 }),
  makeFilm({ title: 'Blade Runner', rating: 70 }),
  makeFilm({ title: 'Solaris', rating: 60 }),
];

describe('FilterStatus', () => {
  it('says how many titles are showing, of how many', () => {
    render(
      <FilterStatus films={library} visible={library.slice(0, 1)} criteria={{ minRating: 80 }} onChange={vi.fn()} />,
    );
    expect(screen.getByText('1 of 3 titles')).toBeInTheDocument();
  });

  it('announces the count politely, from a region that is always mounted', () => {
    // A live region mounted only when something changes is frequently missed by
    // screen readers — the mistake this project already fixed once in DropZone.
    const { container, rerender } = render(
      <FilterStatus films={library} visible={library} criteria={{}} onChange={vi.fn()} />,
    );
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).toHaveTextContent('3 of 3 titles');

    rerender(
      <FilterStatus films={library} visible={library.slice(0, 1)} criteria={{ minRating: 80 }} onChange={vi.fn()} />,
    );
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('1 of 3 titles');
  });

  it('shows one chip per active criterion, and none when nothing is set', () => {
    const { rerender } = render(
      <FilterStatus films={library} visible={library} criteria={{}} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();

    rerender(
      <FilterStatus
        films={library}
        visible={library}
        criteria={{ minRating: 80, genres: ['Crime'] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button', { name: /Remove filter/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();
  });

  it('removes exactly the criterion its chip names, and no other', async () => {
    const onChange = vi.fn();
    render(
      <FilterStatus
        films={library}
        visible={library}
        criteria={{ minRating: 80, genres: ['Crime'], topN: 10 }}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Genre: Crime' }));

    expect(onChange).toHaveBeenCalledWith({ minRating: 80, topN: 10 });
  });

  it('clears everything at once', async () => {
    const onChange = vi.fn();
    render(
      <FilterStatus films={library} visible={library} criteria={{ minRating: 80 }} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(onChange).toHaveBeenCalledWith({});
  });
});
```

Create `tests/ui/filters/NoResults.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoResults } from '@/ui/filters/NoResults';
import { makeFilm } from '../../support/film';

const library = [
  makeFilm({ title: 'Heat', rating: 95, genres: ['Crime'] }),
  makeFilm({ title: 'Blade Runner', rating: 40, genres: ['Science fiction'] }),
  makeFilm({ title: 'Solaris', rating: 30, genres: ['Science fiction'] }),
];

describe('NoResults', () => {
  it('names the criterion that is cutting the most, and offers to drop it', async () => {
    const onChange = vi.fn();
    render(
      <NoResults
        films={library}
        criteria={{ minRating: 99, genres: ['Science fiction'] }}
        onChange={onChange}
      />,
    );

    // Dropping the rating bound admits two films; dropping the genre admits none.
    expect(screen.getByText(/Rating 99 or more/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Rating 99 or more' }));
    expect(onChange).toHaveBeenCalledWith({ genres: ['Science fiction'] });
  });

  it('says so plainly when no single filter is to blame', () => {
    render(<NoResults films={library} criteria={{ minRating: 99, genres: ['Western'] }} onChange={vi.fn()} />);

    expect(screen.getByText(/several are combining/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
  });

  it('always offers to clear everything', async () => {
    const onChange = vi.fn();
    render(<NoResults films={library} criteria={{ minRating: 99 }} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onChange).toHaveBeenCalledWith({});
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/ui/filters/FilterStatus.test.tsx tests/ui/filters/NoResults.test.tsx
```

Expected: FAIL — neither module exists.

- [ ] **Step 3: Write the status bar**

Create `src/ui/filters/FilterStatus.tsx`:

```tsx
import {
  activeCriteria,
  describeCriterion,
  withoutCriterion,
  type FilterCriteria,
} from '@/domain/filters';
import type { Film } from '@/domain/film';

interface FilterStatusProps {
  films: Film[];
  visible: Film[];
  criteria: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
}

const CHIP =
  'rounded-card border border-line px-2 py-1 text-xs text-ink-dim hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent';

export function FilterStatus({ films, visible, criteria, onChange }: FilterStatusProps) {
  const active = activeCriteria(criteria);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Always mounted, never conditionally rendered: a live region that
          appears at the same moment as its message is routinely missed. */}
      <p aria-live="polite" className="text-sm text-ink">
        {visible.length} of {films.length} titles
      </p>

      {active.map((key) => {
        const description = describeCriterion(key, criteria);
        return (
          <button
            key={key}
            type="button"
            aria-label={`Remove filter: ${description}`}
            onClick={() => onChange(withoutCriterion(criteria, key))}
            className={CHIP}
          >
            {description} <span aria-hidden="true">×</span>
          </button>
        );
      })}

      {active.length > 0 && (
        <button type="button" onClick={() => onChange({})} className={CHIP}>
          Clear all filters
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the zero-result screen**

Create `src/ui/filters/NoResults.tsx`:

```tsx
import {
  describeCriterion,
  mostRestrictiveCriterion,
  withoutCriterion,
  type FilterCriteria,
} from '@/domain/filters';
import type { Film } from '@/domain/film';

interface NoResultsProps {
  films: Film[];
  criteria: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
}

const ACTION =
  'rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent';

/**
 * Eleven axes make zero results the most common state of the rail, and an empty
 * grid with no explanation is a failure this project has shipped once already,
 * when an import produced no films.
 */
export function NoResults({ films, criteria, onChange }: NoResultsProps) {
  const culprit = mostRestrictiveCriterion(films, criteria);
  const description = culprit ? describeCriterion(culprit, criteria) : null;

  return (
    <div className="space-y-3 rounded-card bg-surface px-5 py-10 text-center">
      <p className="font-display text-lg text-ink">Nothing matches these filters.</p>

      {culprit && description ? (
        <>
          <p className="text-sm text-ink-dim">{description} is cutting the most.</p>
          <button
            type="button"
            aria-label={`Remove filter: ${description}`}
            onClick={() => onChange(withoutCriterion(criteria, culprit))}
            className={ACTION}
          >
            Remove it
          </button>
        </>
      ) : (
        <p className="text-sm text-ink-dim">
          No single filter explains it — several are combining to exclude everything.
        </p>
      )}

      <div>
        <button type="button" onClick={() => onChange({})} className={ACTION}>
          Clear all filters
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run them and watch them pass**

```bash
npm run test:run -- tests/ui/filters && npm run typecheck && npm run lint
```

Expected: PASS, clean.

- [ ] **Step 6: Prove the chip removes only its own criterion**

Change `withoutCriterion(criteria, key)` in `FilterStatus` to `{}`, run the file,
confirm the "removes exactly the criterion its chip names" test goes red, restore
it.

- [ ] **Step 7: Commit**

```bash
git add src/ui/filters tests/ui/filters
git commit -m "feat(ui): show what is filtered, and explain an empty result"
```

---

### Task 11: Wire the rail into the library screen

**Files:**
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/App.test.tsx`

**Interfaces:**
- Consumes: everything built above — `FilterRail`, `FilterStatus`, `NoResults`,
  `applyFilters`, `activeCriteria`, `saveFilters`/`loadFilters`/`clearFilters`,
  `enrichDetails`/`countPendingDetails`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/App.test.tsx`, following the mocking style the file already
uses for `@/services/library` and `@/enrich/enrichLibrary`:

```tsx
it('filters the grid by the restored criteria', async () => {
  // Restored criteria have to reach the grid, not merely the rail: a rail that
  // shows a filter the grid ignores is worse than no rail.
  loadLibrary.mockResolvedValue([
    film({ id: 'a', title: 'Kept', rating: 90 }),
    film({ id: 'b', title: 'Cut', rating: 10 }),
  ]);
  loadFilters.mockResolvedValue({ minRating: 80 });

  render(<App />);

  expect(await screen.findByText('Kept')).toBeInTheDocument();
  expect(screen.queryByText('Cut')).not.toBeInTheDocument();
  expect(screen.getByText('1 of 2 titles')).toBeInTheDocument();
});

it('saves the criteria as they change', async () => {
  loadLibrary.mockResolvedValue([film({ id: 'a', title: 'Kept', rating: 90 })]);
  loadFilters.mockResolvedValue(null);
  render(<App />);
  await screen.findByText('Kept');

  fireEvent.change(screen.getByLabelText('Minimum rating'), { target: { value: '50' } });

  await waitFor(() => {
    expect(saveFilters).toHaveBeenCalledWith(expect.objectContaining({ minRating: 50 }));
  });
});

it('forgets the criteria when the last one is cleared', async () => {
  // Rather than persisting an empty object, which would restore as a filtered
  // view that admits everything.
  loadLibrary.mockResolvedValue([film({ id: 'a', title: 'Kept', rating: 90 })]);
  loadFilters.mockResolvedValue({ minRating: 80 });
  render(<App />);
  await screen.findByText('Kept');

  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

  await waitFor(() => {
    expect(clearFilters).toHaveBeenCalled();
  });
});

it('shows the library when the criteria cannot be read at all', async () => {
  // Private browsing, a blocked database, a failed upgrade. Losing a preference
  // must not cost the page.
  loadLibrary.mockResolvedValue([film({ id: 'a', title: 'Kept', rating: 90 })]);
  loadFilters.mockRejectedValue(new Error('storage is blocked'));

  render(<App />);

  expect(await screen.findByText('Kept')).toBeInTheDocument();
});

it('explains an empty result instead of showing an empty grid', async () => {
  loadLibrary.mockResolvedValue([film({ id: 'a', title: 'Kept', rating: 10 })]);
  loadFilters.mockResolvedValue({ minRating: 90 });

  render(<App />);

  expect(await screen.findByText('Nothing matches these filters.')).toBeInTheDocument();
});

it('runs the details pass over a restored library', async () => {
  loadLibrary.mockResolvedValue([film({ id: 'a', title: 'Kept', rating: 90 })]);
  loadFilters.mockResolvedValue(null);

  render(<App />);
  await screen.findByText('Kept');

  await waitFor(() => {
    expect(enrichDetails).toHaveBeenCalled();
  });
});
```

Add `vi.mock('@/services/filters', ...)` exposing `loadFilters`, `saveFilters`
and `clearFilters` as `vi.fn()`, and `vi.mock('@/enrich/enrichDetails', ...)`
exposing `enrichDetails` (resolving to the films it was given) and
`countPendingDetails` (returning `films.length`). Reset them in the file's
existing `beforeEach`. Give the existing tests in the file a
`loadFilters.mockResolvedValue(null)` default there too, so none of them starts
filtered.

The existing `film` factory in this file takes an id; extend it to
`film(id: string, overrides: Partial<Film> = {})` and spread the overrides, so
the new tests can set a title and a rating.

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run test:run -- tests/ui/App.test.tsx
```

Expected: FAIL — no rail, no status line, no filtering.

- [ ] **Step 3: Hold the criteria in App**

In `src/ui/App.tsx`, add the imports and the state. The criteria live here for
the same reason the library does: `App` already orchestrates import, enrichment
and persistence, and the rail is the only consumer — a context would add an
indirection for one reader.

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilterRail } from './filters/FilterRail';
import { FilterStatus } from './filters/FilterStatus';
import { NoResults } from './filters/NoResults';
import { applyFilters, activeCriteria, type FilterCriteria } from '@/domain/filters';
import { saveFilters, loadFilters, clearFilters } from '@/services/filters';
import { enrichDetails, countPendingDetails } from '@/enrich/enrichDetails';
```

Inside the component, beside the existing state:

```tsx
  const [criteria, setCriteria] = useState<FilterCriteria>({});
  const [fetchingDetails, setFetchingDetails] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    loadFilters()
      .then((restored) => {
        if (restored) setCriteria(restored);
      })
      .catch((error: unknown) => {
        // A lost preference costs a click. Letting it propagate would cost the page.
        console.error('Failed to restore the saved filters', error);
      });
  }, []);

  const updateCriteria = useCallback((next: FilterCriteria) => {
    setCriteria(next);
    // Writing {} back would restore as a filtered view that admits everything.
    const written = activeCriteria(next).length > 0 ? saveFilters(next) : clearFilters();
    written.catch((error: unknown) => {
      console.error('Failed to save the filters', error);
    });
  }, []);

  // Before the early return, so the hook order never depends on whether a
  // library has been imported yet.
  const visible = useMemo(
    () => (films ? applyFilters(films, criteria) : []),
    [films, criteria],
  );
```

- [ ] **Step 4: Run the details pass, after posters and after a restore**

Add this callback beside `onImported`:

```tsx
  // The second pass. It runs after the poster pass rather than beside it: the
  // grid is useless without posters and merely less filterable without genres,
  // and running both at once doubles the requests in flight.
  const fillInDetails = useCallback(async (library: Film[], id: number) => {
    const total = countPendingDetails(library);
    if (total === 0) return;

    setFetchingDetails({ done: 0, total });
    const detailed = await enrichDetails(library, (progress) => {
      if (runId.current !== id) return;
      setFilms(progress.films);
      setFetchingDetails({ done: progress.done, total: progress.total });
    });

    if (runId.current !== id) return;
    setFilms(detailed);
    setFetchingDetails(null);
    await saveLibrary(detailed);
  }, []);
```

At the end of `onImported`, after the existing `await saveLibrary(enriched);`:

```tsx
    await fillInDetails(enriched, id);
```

and add `fillInDetails` to that callback's dependency array.

In the restore effect, run it over what came back — a library saved before this
feature existed carries `detailsFetched: false` on every record, and a library
saved after it carries no pending work, so the pass costs nothing:

```tsx
  useEffect(() => {
    loadLibrary()
      .then((restored) => {
        if (!restored || restoreCancelled.current) return;
        setFilms(restored);
        const id = ++runId.current;
        return fillInDetails(restored, id);
      })
      .catch((error: unknown) => {
        console.error('Failed to restore the saved library', error);
      });
  }, [fillInDetails]);
```

- [ ] **Step 5: Clear the criteria on reset**

In `reset()`, beside the existing clears:

```tsx
    setCriteria({});
    setFetchingDetails(null);
    clearFilters().catch((error: unknown) => {
      console.error('Failed to clear the saved filters', error);
    });
```

- [ ] **Step 6: Lay out the library screen around the rail**

Replace the library branch's returned markup with:

```tsx
    return (
      <Shell>
        <div className="mx-auto max-w-7xl space-y-4 px-6 py-8">
          <LibraryHeader
            films={films}
            warnings={warnings}
            skipped={skipped}
            enriching={enriching}
            onReset={reset}
          />

          {/* Below the rail's breakpoint the column becomes a sheet: same
              markup, opened on demand, so nothing has to render twice. */}
          <button
            type="button"
            onClick={() => setRailOpen((open) => !open)}
            aria-expanded={railOpen}
            aria-controls="filter-rail"
            className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink lg:hidden"
          >
            Filters
          </button>

          <div className="flex flex-col gap-4 lg:flex-row">
            <aside
              id="filter-rail"
              className={`${railOpen ? 'block' : 'hidden'} shrink-0 lg:block lg:w-64`}
            >
              <FilterRail
                films={films}
                criteria={criteria}
                onChange={updateCriteria}
                fetchingDetails={fetchingDetails}
              />
            </aside>

            <div className="min-w-0 flex-1 space-y-3">
              <FilterStatus
                films={films}
                visible={visible}
                criteria={criteria}
                onChange={updateCriteria}
              />
              {visible.length === 0 ? (
                <NoResults films={films} criteria={criteria} onChange={updateCriteria} />
              ) : (
                <FilmGrid films={visible} generation={generation} />
              )}
            </div>
          </div>
        </div>
      </Shell>
    );
```

- [ ] **Step 7: Run the whole suite**

```bash
npm run test:run && npm run typecheck && npm run lint && npm run build
```

Expected: all green. If coverage falls below a threshold, the uncovered lines
are the answer — add the test, do not lower the threshold.

- [ ] **Step 8: Prove the filtering test can fail**

Change `<FilmGrid films={visible} …>` to `<FilmGrid films={films} …>`, run
`tests/ui/App.test.tsx`, confirm "filters the grid by the restored criteria" goes
red, then restore it.

- [ ] **Step 9: Commit**

```bash
git add src/ui/App.tsx tests/ui/App.test.tsx
git commit -m "feat(ui): filter the library from the rail, and remember the criteria"
```

---

### Task 12: See it work, then say what shipped

The suite proves the rules. It cannot prove the rail is usable, that both
palettes hold, or that a phone gets something worth touching.

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `docs/superpowers/backlog.md`

- [ ] **Step 1: Run everything one more time**

```bash
npm run test:run && npm run test:coverage && npm run typecheck && npm run lint && npm run build
```

Expected: green, and coverage at or above 90/85/90/90.

- [ ] **Step 2: Look at it, in both themes and at two widths**

`npm run dev`, import a real export — the largest one available, since a rail
that reads well over 20 titles can still be unusable over 800 — and check:

- the rail beside the grid at desktop width, and the Filters button opening it
  below the `lg` breakpoint;
- every section's count changing as controls change, and the first three open;
- the Genre, Director and Runtime sections disabled with a count while the
  details pass runs, and enabled when it stops;
- the same again after switching to the neon theme;
- filtering down to nothing, and the screen that explains it naming a criterion
  whose removal really does bring films back;
- a reload restoring the criteria along with the library.

Two known limits of this project's automated browser checks, established
earlier and not worth rediscovering: the automated tab reports
`visibilityState: "hidden"`, so `requestAnimationFrame` never fires and
`ResizeObserver` never reports. The responsive layout and the grid's column
count therefore cannot be verified through it — resize a real window instead.

- [ ] **Step 3: Time the details pass on a real library**

The spec's risk: a Letterboxd-only library of 800 films makes 800 poster lookups
and then 800 detail lookups. Note in the console how long the second pass takes
on the largest export to hand, and write the number into the backlog. If it runs
past a couple of minutes, that is a finding for the next plan, not a reason to
hold this one.

- [ ] **Step 4: Update the README**

Change the status line to say that filtering works, and describe the rail in the
feature list beside importing and browsing.

- [ ] **Step 5: Update the CHANGELOG**

Under `## [Unreleased]` / `### Added`:

```markdown
- A filter rail over the whole library: rating, era, type, genre, director,
  runtime, watch dates, rewatches and a top-N limit, each section showing how
  many titles it admits on its own, with the active filters as removable chips
  and a screen that names the criterion doing the cutting when nothing matches.
- Genres, directors and runtimes fetched from TMDB after posters, so a
  Letterboxd import filters on the same axes an IMDb one does.
- The active filters are remembered between visits, in the browser.
```

- [ ] **Step 6: Update the backlog**

Close "Letterboxd films have no genres, directors or runtimes" — the details pass
supplies them. Then add what this plan deferred:

- **No year range, only decades.** `FilterCriteria` has no `minYear`/`maxYear`,
  and translating a range into decades answers a different question. A later
  plan can add the axis.
- **The details pass doubles the request count.** Write in the two numbers Step 3
  produced: how many titles, and how long the second pass took.
- **A failed detail lookup is cached as "TMDB had nothing"** for thirty days, the
  same rule the poster cache follows. A title that failed because the network
  dropped will not be asked about again for a month.
- **Episodes never get details.** `lookupByImdbId` reads `movie_results` and
  `tv_results` only, so an imported episode carries no `tmdbId` and the pass
  skips it.
- **The rail renders every section on every keystroke.** Each section's count is
  a full `applyFilters` pass over the library, so a 5000-film library does eight
  passes per change. Memoizing per section is the cheap fix if it is ever felt.

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md docs/superpowers/backlog.md
git commit -m "docs: record the filter rail and what it deferred"
```

---

## Self-review

Run against the spec after the plan was written.

**Spec coverage.** Every section of the spec maps to a task: the criteria and
where they live (Tasks 3, 4, 11), persistence with date revival and the empty
case (Task 4), the eight sections in order with per-section counts (Tasks 7–9),
the count and chips and clear-all (Task 10), option lists that only offer what
the library holds (Tasks 2, 7, 8), the metadata Letterboxd lacks with both TMDB
endpoints and `detailsFetched` (Tasks 1, 5, 6), the disabled-while-running
sections (Task 9), the zero-result screen (Tasks 3, 10), accessibility
(Tasks 7, 9, 10), and the verification list (spread across every task's own
test step, gathered in Task 12).

**Two spec requirements are deliberately not implemented as written**, both
recorded above with reasoning: the Era section offers decades and not a free
year range, and date revival is defensive rather than corrective because
IndexedDB does not stringify Dates in the first place.

**Type consistency.** `ControlsProps` is the single shape every `*Controls`
component takes, `CriterionKey` is used identically in `subsetCriteria`,
`withoutCriterion`, `describeCriterion` and `mostRestrictiveCriterion`,
`TmdbDetails` has one definition consumed by both endpoints, both cache
functions and the pass, and `DetailsProgress` matches the
`{ done, total }` shape `App` stores and `FilterRail` reads.

**Risks carried by this plan, not resolved by it.**

- The details pass doubles TMDB traffic for large libraries. Measured in Task 12
  rather than assumed.
- `created_by` is not a director, and the interface calls it one for series. If
  that reads wrong on screen, change the label, not the data.
- Eleven criteria in one column can overwhelm. The collapsed default and the
  per-section counts are the mitigation; if it still feels heavy once real, a
  later plan promotes a few and demotes the rest.
