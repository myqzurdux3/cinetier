# Cinetier Import & Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the deployed placeholder into a real page: the visitor drops their IMDb or Letterboxd export onto it and sees their own film library, with posters, in seconds.

**Architecture:** The data core from the foundations plan stays untouched and keeps its layer rules. This plan adds the two outer layers on top of it — `services/` (the only code allowed to reach the network or storage) and `ui/` (React components). Enrichment from TMDB is deliberately non-blocking: the grid renders immediately with typographic cards and posters fade in as they arrive, so an 800-film import is usable within a second rather than after a spinner.

**Tech Stack:** React 19, TypeScript 6 strict, Vite 8, Tailwind CSS v4, Vitest 4 (node + jsdom projects), Testing Library, `@zip.js/zip.js`, `idb`, `@tanstack/react-virtual`.

**Spec:** `docs/superpowers/specs/2026-08-18-cinetier-design.md`

**Predecessor:** `docs/superpowers/plans/2026-08-18-cinetier-foundations.md` (complete, merged)

## Global Constraints

- **The repository is public.** Never stage or commit `.env.local`, `.env`, or any file containing an API key. The TMDB key ships in the client bundle by design and is injected at build time from `VITE_TMDB_API_KEY`; that is documented in the README and SECURITY.md and is not a leak to fix.
- **TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any`** in committed code.
- **`src/domain/**` and `src/parsers/**` must not import from `ui/` or `services/`, and must not use `react`, `fetch`, `window`, `document`, `localStorage`, `sessionStorage`, `indexedDB`, `navigator`, `XMLHttpRequest`, `process`, or dynamic `import()`.** ESLint enforces this; never disable the rule. `services/` and `ui/` may use all of them.
- **Ratings are stored normalized 0–100 internally** and always rendered in the source scale via `formatRating` — `imdb10` as a mark out of ten, `letterboxd5` as stars.
- **`watchedAtIsApproximate` must be surfaced in the interface** wherever a watch date is shown. IMDb exports a rating date, not a watch date, and the product's honesty about this is a stated design goal.
- **Nothing but TMDB lookups leaves the browser**, and those carry only a title, year, or IMDb identifier — never ratings or watch history.
- **Tests are written before the code they cover.** Every task follows red → green → commit.
- **Conventional Commits**, scopes limited to `domain`, `parsers`, `services`, `ui`, `deps`, `ci`, `docs`.
- **Repository language is English** — code, comments, commits, documentation, and all user-facing copy.
- **Coverage gates are enforced in CI**: statements 90, branches 85, functions 90, lines 90. Do not lower them.

## Deliberately not in this plan

The filter rail, the tier board and its drag-and-drop, the PNG export, and the JSON
export/import all belong to the next plan. Genres, directors and runtimes for
Letterboxd records need a second TMDB request per film and are only used by the
filter rail, so they go there too. Their absence here is this plan's boundary, not
a gap in it.

One limitation is knowingly carried in: two genuinely distinct films sharing an
exact title *and* release year can still merge when a third record links them.
Enrichment narrows this considerably by giving Letterboxd records an IMDb
identifier — which is why Task 7 re-merges — but it does not eliminate it.

---

## File Structure

```
src/services/tmdb.ts            TMDB lookups: by IMDb id, then by title+year
src/services/tmdbCache.ts       IndexedDB-backed memo for TMDB results
src/services/library.ts         Persist and restore the imported library
src/services/db.ts              One IndexedDB connection, shared by the two stores above
src/enrich/enrichLibrary.ts     Orchestrates progressive enrichment (pure of React)
src/ui/App.tsx                  Screen state machine: welcome -> guide -> library
src/ui/Logo.tsx                 The clapperboard mark, inline SVG
src/ui/Shell.tsx               Header, page frame, footer with TMDB attribution
src/ui/import/SourcePicker.tsx  Two cards: IMDb, Letterboxd
src/ui/import/ImportGuide.tsx   Three-step instructions per source
src/ui/import/DropZone.tsx      Drag, drop, and click-to-browse
src/ui/import/importFiles.ts    File -> parsed library, with errors and warnings
src/ui/library/FilmCard.tsx     One film: poster, or a typographic fallback
src/ui/library/FilmGrid.tsx     Virtualized grid over the library
src/ui/library/LibrarySummary.tsx  Counts, warnings, and the reset action
src/parsers/archive.ts          Letterboxd .zip -> LetterboxdFiles
tests/ui/setup.ts               jsdom setup for component tests
```

Component files stay small and single-purpose: a reviewer should be able to hold any one of them in mind at once. `importFiles.ts` holds the logic that would otherwise bloat `DropZone.tsx`, so the component stays about presentation and the logic stays testable without a DOM.

---

### Task 1: Carried-over corrections from the foundations plan

Four items the previous plan's reviews left open, all small and mechanical. Doing them first means the new UI is built on settled ground.

**Files:**
- Modify: `src/parsers/letterboxd.ts`
- Modify: `src/domain/tiers.ts`
- Modify: `src/domain/normalize.ts`, `tests/domain/normalize.test.ts`
- Modify: `src/parsers/types.ts`, `src/parsers/imdb.ts`, `src/parsers/letterboxd.ts`
- Test: `tests/parsers/letterboxd.test.ts`, `tests/domain/tiers.test.ts`

**Interfaces:**
- Consumes: everything the foundations plan produced.
- Produces: `parseNumber(value: string | undefined): number | null` and `parseDate(value: string | undefined): Date | null`, both exported from `src/parsers/types.ts`.

- [ ] **Step 1: Write the failing test for the same-day rating tie**

Two diary rows for one film on the same date, rated differently, must produce the same result in either order. Add to `tests/parsers/letterboxd.test.ts`:

```ts
it('resolves a same-day double viewing the same way in either row order', () => {
  const header = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date';
  const lower = '2025-06-01,Heat,1995,https://boxd.it/heat,3,,,2025-05-31';
  const higher = '2025-06-02,Heat,1995,https://boxd.it/heat,5,Yes,,2025-05-31';

  const lowerFirst = parseLetterboxdExport({ diary: [header, lower, higher].join('\n') }).films[0]!;
  const higherFirst = parseLetterboxdExport({ diary: [header, higher, lower].join('\n') }).films[0]!;

  expect(lowerFirst.rating).toBe(higherFirst.rating);
  // The higher rating wins: it is the stronger opinion the viewer expressed about that day.
  expect(lowerFirst.rating).toBe(100);
  expect(lowerFirst.isRewatch).toBe(true);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:run -- tests/parsers/letterboxd.test.ts`
Expected: FAIL — the two orders produce 60 and 100.

- [ ] **Step 3: Make the tie-break total, and correct the comment that claims it already is**

In `src/parsers/letterboxd.ts`, `isLaterViewing` currently returns false in both directions when two rows share a date and precision and both carry a rating. Add a final tie-break so exactly one direction wins:

```ts
  // Same date, same precision, both rated: prefer the higher rating. Without this
  // the winner would be whichever row the file happened to list first.
  if (current.rating !== null && candidate.rating !== null) {
    return candidate.rating > current.rating;
  }
```

Place it after the existing rated-beats-unrated clause. The doc comment above the function already claims the fold never depends on row order — with this clause that becomes true, so leave the comment in place and verify it reads correctly.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test:run -- tests/parsers/letterboxd.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `moveFilm` validation**

`moveFilm` currently splices any string into the board. The drag-and-drop layer this plan builds will call it with ids from user gestures, so it must reject anything that is not already on the board. Add to `tests/domain/tiers.test.ts`:

```ts
it('ignores a film id that is not on the board', () => {
  const board = autoFillBoard(films);
  expect(moveFilm(board, 'not-a-real-id', 'S', 0)).toBe(board);
});

it('ignores a tier id that does not exist', () => {
  const board = autoFillBoard(films);
  expect(moveFilm(board, 'a', 'NOPE', 0)).toBe(board);
});
```

- [ ] **Step 6: Run them and confirm the first fails**

Run: `npm run test:run -- tests/domain/tiers.test.ts`
Expected: FAIL on the unknown-film case — it currently inserts the bogus id. The unknown-tier case already passes.

- [ ] **Step 7: Add the guard**

At the top of `moveFilm` in `src/domain/tiers.ts`:

```ts
  const known =
    board.pool.includes(filmId) ||
    Object.values(board.placements).some((ids) => ids.includes(filmId));
  if (!known) return board;
```

- [ ] **Step 8: Run and confirm both pass**

Run: `npm run test:run -- tests/domain/tiers.test.ts`
Expected: PASS.

- [ ] **Step 9: Move the duplicated CSV helpers into the shared module**

`parseNumber` and `parseDate` are byte-identical in `src/parsers/imdb.ts` and `src/parsers/letterboxd.ts`. Move one copy into `src/parsers/types.ts`, exported, and import it in both parsers:

```ts
/** Parse a CSV cell as a number, treating blank and unparseable values as absent. */
export function parseNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse a CSV cell as a date, treating blank and unparseable values as absent. */
export function parseDate(value: string | undefined): Date | null {
  if (!value || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
```

Delete both local copies. Do not change their behaviour.

- [ ] **Step 10: Remove `matchKey`, which nothing but its own test calls**

`src/domain/normalize.ts` exports `matchKey`; the only importer is `tests/domain/normalize.test.ts`. `src/domain/dedupe.ts` needs its two key forms separately and cannot use it. Two copies of the same key format can drift apart silently.

Delete `matchKey` from `src/domain/normalize.ts` and delete its `describe` block from `tests/domain/normalize.test.ts`. Keep `normalizeTitle` and all of its tests — `dedupe.ts` uses it.

- [ ] **Step 11: Run everything**

```bash
npm run test:run && npm run test:coverage && npm run typecheck && npm run lint && npm run build
```

Expected: all pass, coverage still above the configured gates.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "fix(parsers): break same-day rating ties deterministically"
```

Then split the remaining three into their own commits:

```bash
git commit -m "fix(domain): ignore unknown ids in moveFilm"
git commit -m "refactor(parsers): share the CSV cell helpers"
git commit -m "refactor(domain): drop the unused matchKey helper"
```

Stage each one's files individually so the four commits stay separable.

---

### Task 2: Dependencies, component test infrastructure, and the design system

**Files:**
- Modify: `package.json`, `vite.config.ts`, `eslint.config.js`, `src/index.css`
- Create: `tests/ui/setup.ts`, `tests/ui/smoke.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a jsdom Vitest project matching `tests/ui/**/*.test.tsx`; the Tailwind theme tokens every later component uses.

- [ ] **Step 1: Install what this plan needs**

```bash
npm install @zip.js/zip.js idb @tanstack/react-virtual
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom eslint-plugin-react-hooks
```

`eslint-plugin-react-hooks` was deliberately left out of the foundations plan because nothing used React yet; this plan reintroduces it.

- [ ] **Step 2: Split Vitest into two projects**

The data core runs in `node` and must stay fast; components need a DOM. Replace the `test` block in `vite.config.ts` with:

```ts
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          environment: 'node',
          include: ['tests/domain/**/*.test.ts', 'tests/parsers/**/*.test.ts', 'src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.tsx', 'tests/services/**/*.test.ts', 'tests/enrich/**/*.test.ts'],
          setupFiles: ['tests/ui/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/parsers/**', 'src/services/**', 'src/enrich/**', 'src/ui/**'],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
```

Note the coverage `include` now covers the new directories. Components are covered too — if that proves to push the gates out of reach for presentational files, report it rather than lowering the thresholds.

- [ ] **Step 3: Create the jsdom setup file**

`tests/ui/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Register the react-hooks rules for the UI layer**

In `eslint.config.js`, add a block after the existing ones. Do not touch the `no-restricted-imports` or `no-restricted-globals` block that guards `src/domain/**` and `src/parsers/**`:

```js
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
```

with `import reactHooks from 'eslint-plugin-react-hooks';` at the top.

- [ ] **Step 5: Write a smoke test that proves the jsdom project works**

`tests/ui/smoke.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('component test environment', () => {
  it('renders into a DOM', () => {
    render(<h1>Cinetier</h1>);
    expect(screen.getByRole('heading', { name: 'Cinetier' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it**

Run: `npm run test:run`
Expected: both projects run; the previous 104 tests plus this one pass. If the jsdom project does not pick the file up, the `include` glob or the project config is wrong — fix that before continuing, because every later task depends on it.

- [ ] **Step 7: Extend the theme tokens**

The foundations plan defined the tier colors and three surface colors. Add what the interface needs, in `src/index.css` inside the existing `@theme` block:

```css
  --color-ink: #f4f4f5;
  --color-ink-dim: #a1a1aa;
  --color-line: #27272a;
  --color-danger: #f87171;
  --radius-card: 6px;
```

Keep the existing `--color-screen`, `--color-surface`, `--color-accent` and the six `--color-tier-*` values exactly as they are — `src/domain/tiers.ts` references the tier names by string.

- [ ] **Step 8: Verify and commit**

```bash
npm run test:run && npm run typecheck && npm run lint && npm run build
git add -A
git commit -m "chore(deps): add component test infrastructure and UI dependencies"
```

---

### Task 3: The logo, the shell, and a page that looks like a product

This is the task that changes what a visitor sees. It ships a real page even before anything can be imported.

**Files:**
- Create: `src/ui/Logo.tsx`, `src/ui/Shell.tsx`
- Modify: `src/ui/App.tsx` (moved from `src/App.tsx`), `src/main.tsx`, `index.html`
- Test: `tests/ui/Shell.test.tsx`

**Interfaces:**
- Consumes: the theme tokens from Task 2.
- Produces:
  - `<Logo size?: number />` — inline SVG, no external asset
  - `<Shell>{children}</Shell>` — header with logo and wordmark, main region, footer carrying the TMDB attribution

- [ ] **Step 1: Write the failing test**

`tests/ui/Shell.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Shell } from '@/ui/Shell';

describe('Shell', () => {
  it('names the product and renders its children', () => {
    render(<Shell><p>content</p></Shell>);
    expect(screen.getByRole('banner')).toHaveTextContent('Cinetier');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('carries the attribution TMDB requires', () => {
    render(<Shell><p>content</p></Shell>);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      /uses the TMDB API but is not endorsed or certified by TMDB/i,
    );
  });

  it('states that nothing leaves the browser', () => {
    render(<Shell><p>content</p></Shell>);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/never leave your browser/i);
  });
});
```

The attribution test is not decoration: TMDB's terms require that notice, and a component test is the only thing that will stop someone deleting it during a redesign.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:run -- tests/ui/Shell.test.tsx`
Expected: FAIL — cannot resolve `@/ui/Shell`.

- [ ] **Step 3: Write the logo**

`src/ui/Logo.tsx`. A clapperboard whose diagonal stripes carry the tier colors, which is the one image that says both "film" and "ranking" at 16 pixels:

```tsx
interface LogoProps {
  size?: number;
}

/**
 * The Cinetier mark: a clapperboard whose stripes are the tier colors.
 * Inline SVG rather than a file so it inherits currentColor and needs no request.
 */
export function Logo({ size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Cinetier"
      fill="none"
    >
      <rect x="2" y="11" width="28" height="19" rx="3" fill="var(--color-surface)" />
      <g>
        <path d="M2 4.5 L30 2 L30 10 L2 12.5 Z" fill="#1c1c20" />
        <path d="M5 4.2 L9 3.8 L6.5 11.6 L2.5 12 Z" fill="var(--color-tier-s)" />
        <path d="M12 3.6 L16 3.2 L13.5 11 L9.5 11.4 Z" fill="var(--color-tier-a)" />
        <path d="M19 3 L23 2.6 L20.5 10.4 L16.5 10.8 Z" fill="var(--color-tier-b)" />
        <path d="M26 2.4 L30 2 L30 9.6 L23.5 10.2 Z" fill="var(--color-tier-c)" />
      </g>
      <rect x="7" y="16" width="18" height="2.5" rx="1.25" fill="var(--color-tier-s)" />
      <rect x="7" y="21" width="13" height="2.5" rx="1.25" fill="var(--color-tier-b)" />
      <rect x="7" y="26" width="8" height="2.5" rx="1.25" fill="var(--color-tier-d)" />
    </svg>
  );
}
```

- [ ] **Step 4: Write the shell**

`src/ui/Shell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Logo } from './Logo';

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen bg-screen text-ink flex flex-col">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-line">
        <Logo />
        <span className="text-lg font-semibold tracking-tight">Cinetier</span>
        <span className="ml-auto text-sm text-ink-dim hidden sm:block">
          Turn your film history into a tier list
        </span>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="px-6 py-5 border-t border-line text-xs text-ink-dim space-y-1">
        <p>Your ratings never leave your browser. There is no account and no server.</p>
        <p>
          This product uses the TMDB API but is not endorsed or certified by TMDB. Cinetier is not
          affiliated with IMDb or Letterboxd.
        </p>
      </footer>
    </div>
  );
}
```

- [ ] **Step 5: Move `App.tsx` into the UI layer and render the shell**

Move `src/App.tsx` to `src/ui/App.tsx` and replace its contents:

```tsx
import { Shell } from './Shell';

export default function App() {
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Turn your film history into a tier list</h1>
        <p className="mt-4 text-ink-dim">
          Import your IMDb or Letterboxd export, filter it however you like, and rank it.
        </p>
      </div>
    </Shell>
  );
}
```

Update the import in `src/main.tsx` to `./ui/App`.

- [ ] **Step 6: Give the page a favicon that matches the logo**

Add to `<head>` in `index.html`, using the clapperboard shape reduced to what reads at 16 pixels:

```html
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='2' y='11' width='28' height='19' rx='3' fill='%23141417'/%3E%3Cpath d='M2 4.5 L30 2 L30 10 L2 12.5 Z' fill='%231c1c20'/%3E%3Crect x='7' y='16' width='18' height='3' rx='1.5' fill='%23e05263'/%3E%3Crect x='7' y='21' width='13' height='3' rx='1.5' fill='%23e8b44a'/%3E%3Crect x='7' y='26' width='8' height='3' rx='1.5' fill='%234a9de8'/%3E%3C/svg%3E"
    />
```

- [ ] **Step 7: Run the tests**

Run: `npm run test:run -- tests/ui/Shell.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 8: Look at it**

```bash
npm run dev
```

Open the URL it prints. Confirm the header shows the logo and wordmark, the footer shows both notices, and the page is legible. A component test proves the text exists; only your eyes prove the page is not broken.

- [ ] **Step 9: Verify and commit**

```bash
npm run test:run && npm run typecheck && npm run lint && npm run build
git add -A
git commit -m "feat(ui): add the Cinetier mark and page shell"
```

---

### Task 4: Reading a dropped export — archive, routing, and the drop zone

This is the task the whole plan exists for. When it lands, a visitor can drop their own file on the page and see how many films it holds.

**Files:**
- Create: `src/parsers/archive.ts`, `src/ui/import/importFiles.ts`, `src/ui/import/DropZone.tsx`
- Modify: `src/ui/App.tsx`
- Test: `tests/parsers/archive.test.ts`, `tests/ui/importFiles.test.ts`, `tests/ui/DropZone.test.tsx`

**Interfaces:**
- Consumes: `parseImdbRatings(csvText: string): ParseResult`, `parseLetterboxdExport(files: LetterboxdFiles): ParseResult`, `ParseError` with its `.hint`, `mergeLibraries(...libraries: Film[][]): Film[]`.
- Produces:
  - `readLetterboxdArchive(archive: Blob): Promise<LetterboxdFiles>`
  - `type ImportOutcome = { status: 'ok'; films: Film[]; warnings: string[] } | { status: 'error'; message: string; hint: string }`
  - `importFiles(files: File[]): Promise<ImportOutcome>`
  - `<DropZone onImported={(outcome: ImportOutcome) => void} />`

- [ ] **Step 1: Write the failing archive test**

`tests/parsers/archive.test.ts`. The test builds a zip in memory so it depends on no fixture binary:

```ts
import { describe, it, expect } from 'vitest';
import { BlobWriter, BlobReader, TextReader, ZipWriter } from '@zip.js/zip.js';
import { readLetterboxdArchive } from '@/parsers/archive';

async function makeArchive(entries: Record<string, string>): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'));
  for (const [name, content] of Object.entries(entries)) {
    await writer.add(name, new TextReader(content));
  }
  return writer.close();
}

describe('readLetterboxdArchive', () => {
  it('picks out the three files it needs and ignores the rest', async () => {
    const archive = await makeArchive({
      'diary.csv': 'diary contents',
      'ratings.csv': 'ratings contents',
      'watched.csv': 'watched contents',
      'profile.csv': 'ignored',
      'reviews.csv': 'ignored',
    });

    const files = await readLetterboxdArchive(archive);

    expect(files.diary).toBe('diary contents');
    expect(files.ratings).toBe('ratings contents');
    expect(files.watched).toBe('watched contents');
  });

  it('finds the files inside a nested folder, which is how Letterboxd ships them', async () => {
    const archive = await makeArchive({ 'letterboxd-user-2026/diary.csv': 'diary contents' });
    const files = await readLetterboxdArchive(archive);
    expect(files.diary).toBe('diary contents');
  });

  it('rejects an archive with none of the expected files, naming what it wanted', async () => {
    const archive = await makeArchive({ 'notes.txt': 'nothing useful' });
    await expect(readLetterboxdArchive(archive)).rejects.toThrow(/diary\.csv/);
  });
});
```

The nested-folder case is not hypothetical: Letterboxd's export puts everything under a dated directory, so a reader that only matches top-level names finds nothing at all.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:run -- tests/parsers/archive.test.ts`
Expected: FAIL — cannot resolve `@/parsers/archive`.

- [ ] **Step 3: Write the archive reader**

`src/parsers/archive.ts`:

```ts
import { BlobReader, TextWriter, ZipReader, configure } from '@zip.js/zip.js';
import { ParseError } from './types';
import type { LetterboxdFiles } from './letterboxd';

// Web workers buy nothing for the handful of small CSV files in a Letterboxd
// export, and they do not exist in the test environment.
configure({ useWebWorkers: false });

const WANTED = ['diary', 'ratings', 'watched'] as const;

const HINT =
  'In Letterboxd, go to Settings > Data > Export your data, then upload the .zip exactly as you received it.';

/**
 * Pull the three CSV files Cinetier reads out of a Letterboxd export archive.
 * Entries live under a dated folder, so matching is done on the base name.
 */
export async function readLetterboxdArchive(archive: Blob): Promise<LetterboxdFiles> {
  const reader = new ZipReader(new BlobReader(archive));
  const files: LetterboxdFiles = {};

  try {
    for (const entry of await reader.getEntries()) {
      if (entry.directory || !entry.getData) continue;
      const base = entry.filename.split('/').pop()?.toLowerCase() ?? '';
      const match = WANTED.find((name) => base === `${name}.csv`);
      if (!match) continue;
      files[match] = await entry.getData(new TextWriter());
    }
  } finally {
    await reader.close();
  }

  if (!files.diary && !files.ratings && !files.watched) {
    throw new ParseError(
      'This archive does not contain diary.csv, ratings.csv or watched.csv.',
      HINT,
    );
  }

  return files;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm run test:run -- tests/parsers/archive.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing routing test**

`tests/ui/importFiles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importFiles } from '@/ui/import/importFiles';

const imdbCsv = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');
const diaryCsv = readFileSync('tests/fixtures/letterboxd-diary.csv', 'utf8');

function file(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('importFiles', () => {
  it('recognises an IMDb ratings export by its columns, whatever it is named', async () => {
    const outcome = await importFiles([file('export (1).csv', imdbCsv)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.films).toHaveLength(5);
    expect(outcome.films.every((f) => f.source === 'imdb')).toBe(true);
  });

  it('recognises a Letterboxd diary by its name', async () => {
    const outcome = await importFiles([file('diary.csv', diaryCsv)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.films).toHaveLength(5);
  });

  it('merges files from both services into one library', async () => {
    const outcome = await importFiles([file('ratings.csv', imdbCsv), file('diary.csv', diaryCsv)]);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    // 5 IMDb + 5 diary, with The Matrix, Pulp Fiction and Dune 2021 shared.
    expect(outcome.films.length).toBeLessThan(10);
    const titles = outcome.films.map((f) => f.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('reports an unrecognisable file with a hint rather than a stack trace', async () => {
    const outcome = await importFiles([file('holiday-photos.csv', 'a,b,c\n1,2,3')]);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.message).toMatch(/holiday-photos\.csv/);
    expect(outcome.hint).toMatch(/IMDb|Letterboxd/);
  });

  it('reports an empty selection', async () => {
    const outcome = await importFiles([]);
    expect(outcome.status).toBe('error');
  });
});
```

The first test matters more than it looks: browsers rename duplicate downloads, so a real user's file is frequently `ratings (1).csv`. Detection has to work from the contents, not the name.

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm run test:run -- tests/ui/importFiles.test.ts`
Expected: FAIL — cannot resolve `@/ui/import/importFiles`.

- [ ] **Step 7: Write the router**

`src/ui/import/importFiles.ts`:

```ts
import type { Film } from '@/domain/film';
import { mergeLibraries } from '@/domain/dedupe';
import { parseImdbRatings } from '@/parsers/imdb';
import { parseLetterboxdExport, type LetterboxdFiles } from '@/parsers/letterboxd';
import { readLetterboxdArchive } from '@/parsers/archive';
import { ParseError } from '@/parsers/types';

export type ImportOutcome =
  | { status: 'ok'; films: Film[]; warnings: string[] }
  | { status: 'error'; message: string; hint: string };

const GENERIC_HINT =
  'Drop an IMDb ratings.csv, or a Letterboxd export .zip — or the diary.csv, ratings.csv and watched.csv from inside it.';

/** An IMDb ratings export is identified by its columns, since its name varies. */
function looksLikeImdb(header: string): boolean {
  return header.includes('Const') && header.includes('Your Rating');
}

function letterboxdSlot(name: string): keyof LetterboxdFiles | null {
  const base = name.toLowerCase();
  if (base.includes('diary')) return 'diary';
  if (base.includes('watched')) return 'watched';
  if (base.includes('ratings')) return 'ratings';
  return null;
}

/**
 * Turn whatever the user dropped into one merged library.
 * Files are classified by content first and by name second, because browsers
 * rename downloads and users rename files.
 */
export async function importFiles(files: File[]): Promise<ImportOutcome> {
  if (files.length === 0) {
    return { status: 'error', message: 'No file was selected.', hint: GENERIC_HINT };
  }

  const libraries: Film[][] = [];
  const warnings: string[] = [];
  const letterboxd: LetterboxdFiles = {};

  try {
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        Object.assign(letterboxd, await readLetterboxdArchive(file));
        continue;
      }

      const text = await file.text();
      const header = text.slice(0, text.indexOf('\n'));

      if (looksLikeImdb(header)) {
        const result = parseImdbRatings(text);
        libraries.push(result.films);
        warnings.push(...result.warnings);
        continue;
      }

      const slot = letterboxdSlot(file.name);
      if (slot) {
        letterboxd[slot] = text;
        continue;
      }

      return {
        status: 'error',
        message: `I could not tell what "${file.name}" is.`,
        hint: GENERIC_HINT,
      };
    }

    if (letterboxd.diary || letterboxd.ratings || letterboxd.watched) {
      const result = parseLetterboxdExport(letterboxd);
      libraries.push(result.films);
      warnings.push(...result.warnings);
    }

    return { status: 'ok', films: mergeLibraries(...libraries), warnings };
  } catch (error) {
    if (error instanceof ParseError) {
      return { status: 'error', message: error.message, hint: error.hint };
    }
    return {
      status: 'error',
      message: 'Something went wrong reading that file.',
      hint: GENERIC_HINT,
    };
  }
}
```

- [ ] **Step 8: Run and confirm it passes**

Run: `npm run test:run -- tests/ui/importFiles.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Write the failing drop-zone test**

`tests/ui/DropZone.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { DropZone } from '@/ui/import/DropZone';

const imdbCsv = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');

describe('DropZone', () => {
  it('imports a file chosen through the file picker', async () => {
    const onImported = vi.fn();
    render(<DropZone onImported={onImported} />);

    const input = screen.getByLabelText(/choose a file/i);
    await userEvent.upload(input, new File([imdbCsv], 'ratings.csv', { type: 'text/csv' }));

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(onImported.mock.calls[0]![0]).toMatchObject({ status: 'ok' });
  });

  it('shows the error and its hint when the file is not recognised', async () => {
    render(<DropZone onImported={vi.fn()} />);

    const input = screen.getByLabelText(/choose a file/i);
    await userEvent.upload(input, new File(['a,b\n1,2'], 'random.csv', { type: 'text/csv' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not tell what/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/Letterboxd/);
  });

  it('is reachable and operable without a mouse', async () => {
    render(<DropZone onImported={vi.fn()} />);
    const input = screen.getByLabelText(/choose a file/i);
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });
});
```

The third test exists because a drop zone built only from drag handlers is unusable by keyboard and by anyone on a phone. A real `<input type="file">` behind a label is what makes it work for everyone.

- [ ] **Step 10: Run it and confirm it fails**

Run: `npm run test:run -- tests/ui/DropZone.test.tsx`
Expected: FAIL — cannot resolve `@/ui/import/DropZone`.

- [ ] **Step 11: Write the drop zone**

`src/ui/import/DropZone.tsx`:

```tsx
import { useId, useState, type DragEvent, type ChangeEvent } from 'react';
import { importFiles, type ImportOutcome } from './importFiles';

interface DropZoneProps {
  onImported: (outcome: ImportOutcome) => void;
}

export function DropZone({ onImported }: DropZoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);

  async function handle(files: File[]) {
    setBusy(true);
    setError(null);
    const outcome = await importFiles(files);
    setBusy(false);
    if (outcome.status === 'error') {
      setError({ message: outcome.message, hint: outcome.hint });
      return;
    }
    onImported(outcome);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handle([...event.dataTransfer.files]);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    void handle([...(event.target.files ?? [])]);
  }

  return (
    <div className="mx-auto max-w-xl">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          'rounded-lg border-2 border-dashed p-10 text-center transition-colors',
          dragging ? 'border-accent bg-surface' : 'border-line',
        ].join(' ')}
      >
        <p className="text-lg">{busy ? 'Reading your export…' : 'Drop your export here'}</p>
        <p className="mt-2 text-sm text-ink-dim">
          An IMDb <code>ratings.csv</code>, or a Letterboxd <code>.zip</code> exactly as you
          downloaded it.
        </p>

        <label
          htmlFor={inputId}
          className="mt-5 inline-block cursor-pointer rounded bg-accent px-4 py-2 text-sm font-medium text-screen"
        >
          Choose a file
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          accept=".csv,.zip"
          onChange={onChange}
          className="sr-only"
        />
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded border border-danger/40 bg-danger/10 p-4 text-sm">
          <p className="font-medium text-danger">{error.message}</p>
          <p className="mt-1 text-ink-dim">{error.hint}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Run and confirm it passes**

Run: `npm run test:run -- tests/ui/DropZone.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 13: Put it on the page**

In `src/ui/App.tsx`, hold the imported library in state and show the drop zone until something is imported:

```tsx
import { useState } from 'react';
import { Shell } from './Shell';
import { DropZone } from './import/DropZone';
import type { Film } from '@/domain/film';

export default function App() {
  const [films, setFilms] = useState<Film[] | null>(null);

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-6 py-16">
        {films === null ? (
          <>
            <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight">
              Turn your film history into a tier list
            </h1>
            <DropZone onImported={(outcome) => outcome.status === 'ok' && setFilms(outcome.films)} />
          </>
        ) : (
          <p className="text-center text-2xl">
            {films.length} films imported.
          </p>
        )}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 14: Try it with a real export**

```bash
npm run dev
```

Drop an actual IMDb `ratings.csv` or Letterboxd `.zip` on the page and confirm the count appears. If you do not have one, `tests/fixtures/imdb-ratings.csv` works. Note in your report how long a large file took, if you have one to hand.

- [ ] **Step 15: Verify and commit**

```bash
npm run test:run && npm run test:coverage && npm run typecheck && npm run lint && npm run build
git add -A
git commit -m "feat(ui): import a dropped IMDb or Letterboxd export"
```

---

### Task 5: The three-step import flow

Task 4 accepts a file. This task tells the visitor how to get one, which is the difference between a tool that works and a tool people can use — most have never downloaded their own export.

**Files:**
- Create: `src/ui/import/SourcePicker.tsx`, `src/ui/import/ImportGuide.tsx`
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/SourcePicker.test.tsx`, `tests/ui/ImportGuide.test.tsx`

**Interfaces:**
- Consumes: `<DropZone onImported />` from Task 4.
- Produces:
  - `type ImportSource = 'imdb' | 'letterboxd'`
  - `<SourcePicker onPick={(source: ImportSource) => void} />`
  - `<ImportGuide source={ImportSource} onBack={() => void} onImported={(outcome: ImportOutcome) => void} />`

- [ ] **Step 1: Write the failing tests**

`tests/ui/SourcePicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourcePicker } from '@/ui/import/SourcePicker';

describe('SourcePicker', () => {
  it('offers both services as buttons', () => {
    render(<SourcePicker onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /imdb/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /letterboxd/i })).toBeInTheDocument();
  });

  it('reports which one was chosen', async () => {
    const onPick = vi.fn();
    render(<SourcePicker onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: /letterboxd/i }));
    expect(onPick).toHaveBeenCalledWith('letterboxd');
  });
});
```

`tests/ui/ImportGuide.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportGuide } from '@/ui/import/ImportGuide';

describe('ImportGuide', () => {
  it('gives IMDb-specific instructions naming the file to expect', () => {
    render(<ImportGuide source="imdb" onBack={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByRole('list')).toHaveTextContent(/Your Ratings/i);
    expect(screen.getByRole('list')).toHaveTextContent(/ratings\.csv/i);
  });

  it('gives Letterboxd-specific instructions naming where the export lives', () => {
    render(<ImportGuide source="letterboxd" onBack={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByRole('list')).toHaveTextContent(/Settings/i);
    expect(screen.getByRole('list')).toHaveTextContent(/Export your data/i);
  });

  it('warns IMDb users that their watch dates are really rating dates', () => {
    render(<ImportGuide source="imdb" onBack={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByText(/does not export watch dates/i)).toBeInTheDocument();
  });

  it('lets the visitor go back and choose the other service', async () => {
    const onBack = vi.fn();
    render(<ImportGuide source="imdb" onBack={onBack} onImported={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
```

The third test pins down a promise the spec makes: the interface must say plainly that an IMDb import has no real watch dates, rather than letting the date filter imply a precision the data lacks.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:run -- tests/ui/SourcePicker.test.tsx tests/ui/ImportGuide.test.tsx`
Expected: FAIL — neither module resolves.

- [ ] **Step 3: Write the source picker**

`src/ui/import/SourcePicker.tsx`:

```tsx
export type ImportSource = 'imdb' | 'letterboxd';

interface SourcePickerProps {
  onPick: (source: ImportSource) => void;
}

const SOURCES: { id: ImportSource; name: string; blurb: string }[] = [
  { id: 'imdb', name: 'IMDb', blurb: 'Your ratings, with genres, directors and runtimes.' },
  { id: 'letterboxd', name: 'Letterboxd', blurb: 'Your diary, with real watch dates and rewatches.' },
];

export function SourcePicker({ onPick }: SourcePickerProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SOURCES.map((source) => (
        <button
          key={source.id}
          type="button"
          onClick={() => onPick(source.id)}
          className="rounded-lg border border-line bg-surface p-6 text-left transition-colors hover:border-accent"
        >
          <span className="block text-xl font-semibold">{source.name}</span>
          <span className="mt-1 block text-sm text-ink-dim">{source.blurb}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the guide**

`src/ui/import/ImportGuide.tsx`:

```tsx
import { DropZone } from './DropZone';
import type { ImportOutcome } from './importFiles';
import type { ImportSource } from './SourcePicker';

interface ImportGuideProps {
  source: ImportSource;
  onBack: () => void;
  onImported: (outcome: ImportOutcome) => void;
}

const STEPS: Record<ImportSource, string[]> = {
  imdb: [
    'Sign in to IMDb and open Your Ratings.',
    'Open the ⋯ menu at the top of the list and choose Export.',
    'You will be sent a ratings.csv file — drop it below.',
  ],
  letterboxd: [
    'Sign in to Letterboxd and open Settings.',
    'Go to the Data tab and choose Export your data.',
    'Drop the .zip below exactly as you downloaded it — no need to unpack it.',
  ],
};

export function ImportGuide({ source, onBack, onImported }: ImportGuideProps) {
  return (
    <div className="space-y-8">
      <button type="button" onClick={onBack} className="text-sm text-ink-dim hover:text-ink">
        ← Back to the other service
      </button>

      <ol className="space-y-3">
        {STEPS[source].map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs text-ink-dim">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {source === 'imdb' && (
        <p className="rounded border border-line bg-surface p-4 text-sm text-ink-dim">
          IMDb does not export watch dates — only the date you rated a film. Cinetier uses that
          instead and labels it as an estimate, so date filters stay honest.
        </p>
      )}

      <DropZone onImported={onImported} />
    </div>
  );
}
```

- [ ] **Step 5: Run and confirm they pass**

Run: `npm run test:run -- tests/ui/SourcePicker.test.tsx tests/ui/ImportGuide.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Wire the flow into the app**

In `src/ui/App.tsx`, replace the body with a three-state screen: choose a source, follow the guide, then the library.

```tsx
import { useState } from 'react';
import { Shell } from './Shell';
import { SourcePicker, type ImportSource } from './import/SourcePicker';
import { ImportGuide } from './import/ImportGuide';
import type { Film } from '@/domain/film';

export default function App() {
  const [source, setSource] = useState<ImportSource | null>(null);
  const [films, setFilms] = useState<Film[] | null>(null);

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-6 py-16">
        {films !== null ? (
          <p className="text-center text-2xl">{films.length} films imported.</p>
        ) : source === null ? (
          <>
            <h1 className="mb-3 text-center text-3xl font-semibold tracking-tight">
              Turn your film history into a tier list
            </h1>
            <p className="mb-10 text-center text-ink-dim">
              Where do you keep your films?
            </p>
            <SourcePicker onPick={setSource} />
          </>
        ) : (
          <ImportGuide
            source={source}
            onBack={() => setSource(null)}
            onImported={(outcome) => outcome.status === 'ok' && setFilms(outcome.films)}
          />
        )}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 7: Verify and commit**

```bash
npm run test:run && npm run typecheck && npm run lint && npm run build
git add -A
git commit -m "feat(ui): guide the visitor to their own export"
```

---

### Task 6: TMDB lookups and their cache

**Files:**
- Create: `src/services/db.ts`, `src/services/tmdb.ts`, `src/services/tmdbCache.ts`
- Modify: `package.json` (dev dependency only)
- Test: `tests/services/tmdb.test.ts`, `tests/services/tmdbCache.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface TmdbMatch { tmdbId: number; imdbId: string | null; posterPath: string | null; publicRating: number | null }`
  - `lookupByImdbId(imdbId: string): Promise<TmdbMatch | null>`
  - `searchByTitle(title: string, year: number | null): Promise<TmdbMatch | null>`
  - `posterUrl(posterPath: string, size?: 'w185' | 'w342'): string`
  - `getCached(key: string): Promise<TmdbMatch | null | undefined>` — `undefined` means "never looked up", `null` means "looked up and not found"
  - `putCached(key: string, match: TmdbMatch | null): Promise<void>`

**Scope note:** this task fetches only what the library screen needs — the poster, the TMDB id, and the public rating. Genres, directors and runtimes require a second request per film and are only needed by the filter rail, so they belong to the plan that builds it. Do not add them here.

- [ ] **Step 1: Install the IndexedDB test double**

```bash
npm install -D fake-indexeddb
```

jsdom has no IndexedDB, so cache tests need one.

- [ ] **Step 2: Write the failing TMDB tests**

`tests/services/tmdb.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { lookupByImdbId, searchByTitle, posterUrl } from '@/services/tmdb';

function mockFetch(payload: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupByImdbId', () => {
  it('returns the first movie result', async () => {
    mockFetch({
      movie_results: [{ id: 603, poster_path: '/matrix.jpg', vote_average: 8.2 }],
    });

    const match = await lookupByImdbId('tt0133093');

    expect(match).toEqual({
      tmdbId: 603,
      imdbId: 'tt0133093',
      posterPath: '/matrix.jpg',
      publicRating: 82,
    });
  });

  it('returns null when TMDB knows nothing about that identifier', async () => {
    mockFetch({ movie_results: [] });
    expect(await lookupByImdbId('tt9999999')).toBeNull();
  });

  it('treats a zero vote average as no public rating rather than a rating of zero', async () => {
    mockFetch({ movie_results: [{ id: 1, poster_path: null, vote_average: 0 }] });
    const match = await lookupByImdbId('tt0000001');
    expect(match?.publicRating).toBeNull();
  });

  it('returns null rather than throwing when TMDB fails', async () => {
    mockFetch({}, false);
    expect(await lookupByImdbId('tt0133093')).toBeNull();
  });

  it('sends the identifier but never anything about the user', async () => {
    const fetchMock = mockFetch({ movie_results: [] });
    await lookupByImdbId('tt0133093');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('tt0133093');
    expect(url).toContain('external_source=imdb_id');
  });
});

describe('searchByTitle', () => {
  it('constrains the search by year when one is known', async () => {
    const fetchMock = mockFetch({ results: [{ id: 438631, poster_path: '/dune.jpg', vote_average: 7.8 }] });
    const match = await searchByTitle('Dune', 2021);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('year=2021');
    expect(match).toMatchObject({ tmdbId: 438631, publicRating: 78 });
  });

  it('omits the year when the export did not carry one', async () => {
    const fetchMock = mockFetch({ results: [] });
    await searchByTitle('Dune', null);
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('year=');
  });
});

describe('posterUrl', () => {
  it('builds a TMDB image URL at the requested size', () => {
    expect(posterUrl('/matrix.jpg')).toBe('https://image.tmdb.org/t/p/w342/matrix.jpg');
    expect(posterUrl('/matrix.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/matrix.jpg');
  });
});
```

The zero-vote-average test is the important one. TMDB reports `0` for a film nobody has rated, and the rating pipeline rejects values outside 1–10 by throwing. Feeding a raw `0` into it would abort an entire enrichment run — the same shape of defect that once aborted a whole IMDb import.

- [ ] **Step 3: Run and confirm they fail**

Run: `npm run test:run -- tests/services/tmdb.test.ts`
Expected: FAIL — cannot resolve `@/services/tmdb`.

- [ ] **Step 4: Write the TMDB client**

`src/services/tmdb.ts`:

```ts
import { normalizeRating } from '@/domain/rating';

export interface TmdbMatch {
  tmdbId: number;
  imdbId: string | null;
  posterPath: string | null;
  publicRating: number | null;
}

interface TmdbMovieSummary {
  id: number;
  poster_path: string | null;
  vote_average: number;
}

const BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * TMDB reports 0 for a film nobody has rated. Passing that to normalizeRating
 * would throw, so an absent rating is represented as absent.
 */
function toPublicRating(voteAverage: number): number | null {
  if (!Number.isFinite(voteAverage) || voteAverage <= 0 || voteAverage > 10) return null;
  return normalizeRating(voteAverage, 'imdb10');
}

function toMatch(movie: TmdbMovieSummary, imdbId: string | null): TmdbMatch {
  return {
    tmdbId: movie.id,
    imdbId,
    posterPath: movie.poster_path,
    publicRating: toPublicRating(movie.vote_average),
  };
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    // A failed lookup costs a poster, never the import. Never let it propagate.
    return null;
  }
}

function key(): string {
  return import.meta.env.VITE_TMDB_API_KEY;
}

/** Resolve a film by its IMDb identifier — the reliable path, when we have one. */
export async function lookupByImdbId(imdbId: string): Promise<TmdbMatch | null> {
  const payload = await getJson(
    `${BASE}/find/${imdbId}?api_key=${key()}&external_source=imdb_id`,
  );
  const results = (payload as { movie_results?: TmdbMovieSummary[] } | null)?.movie_results;
  const first = results?.[0];
  return first ? toMatch(first, imdbId) : null;
}

/** Resolve a film by title and year — the fallback for Letterboxd records. */
export async function searchByTitle(title: string, year: number | null): Promise<TmdbMatch | null> {
  const params = new URLSearchParams({ api_key: key(), query: title });
  if (year !== null) params.set('year', String(year));

  const payload = await getJson(`${BASE}/search/movie?${params.toString()}`);
  const first = (payload as { results?: TmdbMovieSummary[] } | null)?.results?.[0];
  return first ? toMatch(first, null) : null;
}

export function posterUrl(posterPath: string, size: 'w185' | 'w342' = 'w342'): string {
  return `${IMAGE_BASE}/${size}${posterPath}`;
}
```

- [ ] **Step 5: Run and confirm they pass**

Run: `npm run test:run -- tests/services/tmdb.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the failing cache tests**

`tests/services/tmdbCache.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getCached, putCached, CACHE_TTL_MS } from '@/services/tmdbCache';
import { resetDatabase } from '@/services/db';

beforeEach(async () => {
  await resetDatabase();
});

describe('tmdbCache', () => {
  it('reports a key it has never seen as unknown, not as absent', async () => {
    expect(await getCached('imdb:tt0133093')).toBeUndefined();
  });

  it('round-trips a match', async () => {
    const match = { tmdbId: 603, imdbId: 'tt0133093', posterPath: '/m.jpg', publicRating: 82 };
    await putCached('imdb:tt0133093', match);
    expect(await getCached('imdb:tt0133093')).toEqual(match);
  });

  it('remembers that a lookup found nothing, so it is not repeated', async () => {
    await putCached('imdb:tt9999999', null);
    expect(await getCached('imdb:tt9999999')).toBeNull();
  });

  it('ignores an entry older than the time to live', async () => {
    const match = { tmdbId: 1, imdbId: null, posterPath: null, publicRating: null };
    await putCached('title:old', match, Date.now() - CACHE_TTL_MS - 1);
    expect(await getCached('title:old')).toBeUndefined();
  });
});
```

The distinction between `undefined` and `null` is what stops the app asking TMDB about the same unknown film on every visit.

- [ ] **Step 7: Run and confirm they fail**

Run: `npm run test:run -- tests/services/tmdbCache.test.ts`
Expected: FAIL — cannot resolve `@/services/tmdbCache`.

- [ ] **Step 8: Write the shared database module**

`src/services/db.ts`:

```ts
import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TmdbMatch } from './tmdb';
import type { Film } from '@/domain/film';

export interface CinetierDB extends DBSchema {
  tmdb: {
    key: string;
    value: { match: TmdbMatch | null; fetchedAt: number };
  };
  library: {
    key: string;
    value: { films: Film[]; savedAt: number };
  };
}

const NAME = 'cinetier';
const VERSION = 1;

let connection: Promise<IDBPDatabase<CinetierDB>> | null = null;

export function db(): Promise<IDBPDatabase<CinetierDB>> {
  connection ??= openDB<CinetierDB>(NAME, VERSION, {
    upgrade(database) {
      database.createObjectStore('tmdb');
      database.createObjectStore('library');
    },
  });
  return connection;
}

/** Drop everything. Used by tests, and by the interface's "start over" action. */
export async function resetDatabase(): Promise<void> {
  if (connection) (await connection).close();
  connection = null;
  await deleteDB(NAME);
}
```

- [ ] **Step 9: Write the cache**

`src/services/tmdbCache.ts`:

```ts
import { db } from './db';
import type { TmdbMatch } from './tmdb';

/** Thirty days. Posters change rarely, and a stale poster is a small cost. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * undefined -> never looked up. null -> looked up, TMDB had nothing.
 * The difference is what stops us asking about the same unknown film forever.
 */
export async function getCached(key: string): Promise<TmdbMatch | null | undefined> {
  const entry = await (await db()).get('tmdb', key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return undefined;
  return entry.match;
}

export async function putCached(
  key: string,
  match: TmdbMatch | null,
  fetchedAt: number = Date.now(),
): Promise<void> {
  await (await db()).put('tmdb', { match, fetchedAt }, key);
}
```

- [ ] **Step 10: Run and confirm they pass**

Run: `npm run test:run -- tests/services/tmdbCache.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 11: Verify and commit**

```bash
npm run test:run && npm run test:coverage && npm run typecheck && npm run lint && npm run build
git add -A
git commit -m "feat(services): look up films on TMDB and cache the results"
```

---

### Task 7: Progressive enrichment

**Files:**
- Create: `src/enrich/enrichLibrary.ts`
- Test: `tests/enrich/enrichLibrary.test.ts`

**Interfaces:**
- Consumes: `lookupByImdbId`, `searchByTitle`, `TmdbMatch` (Task 6); `getCached`, `putCached` (Task 6); `mergeLibraries` (foundations plan); `Film`.
- Produces:
  - `interface EnrichProgress { films: Film[]; done: number; total: number }`
  - `enrichLibrary(films: Film[], onProgress: (progress: EnrichProgress) => void, options?: { concurrency?: number }): Promise<Film[]>`

This module is deliberately free of React so the whole behaviour can be tested without rendering anything.

**Why it re-merges at the end:** a Letterboxd export carries no IMDb identifier, so before enrichment a Letterboxd record and an IMDb record of the same film can only match on title and year. Enrichment resolves an IMDb identifier for the Letterboxd record, which means films that could not be matched before may now match exactly. Re-running the merge afterwards is what turns that new information into a corrected library — without it the enrichment is decorative.

- [ ] **Step 1: Write the failing tests**

`tests/enrich/enrichLibrary.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { enrichLibrary } from '@/enrich/enrichLibrary';
import { resetDatabase } from '@/services/db';
import type { Film } from '@/domain/film';

vi.mock('@/services/tmdb', async () => {
  const actual = await vi.importActual<typeof import('@/services/tmdb')>('@/services/tmdb');
  return {
    ...actual,
    lookupByImdbId: vi.fn(),
    searchByTitle: vi.fn(),
  };
});

const { lookupByImdbId, searchByTitle } = await import('@/services/tmdb');

function film(overrides: Partial<Film> & Pick<Film, 'id' | 'title'>): Film {
  return {
    imdbId: null, tmdbId: null, year: 1999, rating: null, ratingScale: 'imdb10',
    watchedAt: null, watchedAtIsApproximate: false, isRewatch: false,
    genres: [], directors: [], runtimeMinutes: null, publicRating: null,
    posterPath: null, source: 'letterboxd', ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(lookupByImdbId).mockReset();
  vi.mocked(searchByTitle).mockReset();
});

describe('enrichLibrary', () => {
  it('uses the IMDb identifier when the film has one', async () => {
    vi.mocked(lookupByImdbId).mockResolvedValue({
      tmdbId: 603, imdbId: 'tt0133093', posterPath: '/m.jpg', publicRating: 82,
    });

    const result = await enrichLibrary(
      [film({ id: 'imdb:tt0133093', title: 'The Matrix', imdbId: 'tt0133093', source: 'imdb' })],
      () => {},
    );

    expect(lookupByImdbId).toHaveBeenCalledWith('tt0133093');
    expect(searchByTitle).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({ tmdbId: 603, posterPath: '/m.jpg' });
  });

  it('falls back to a title search when there is no identifier', async () => {
    vi.mocked(searchByTitle).mockResolvedValue({
      tmdbId: 438631, imdbId: null, posterPath: '/dune.jpg', publicRating: 78,
    });

    const result = await enrichLibrary([film({ id: 'lb:dune', title: 'Dune', year: 2021 })], () => {});

    expect(searchByTitle).toHaveBeenCalledWith('Dune', 2021);
    expect(result[0]!.posterPath).toBe('/dune.jpg');
  });

  it('never overwrites a rating the user gave with the public one', async () => {
    vi.mocked(searchByTitle).mockResolvedValue({
      tmdbId: 1, imdbId: null, posterPath: null, publicRating: 78,
    });

    const result = await enrichLibrary([film({ id: 'lb:x', title: 'X', rating: 100 })], () => {});

    expect(result[0]!.rating).toBe(100);
    expect(result[0]!.publicRating).toBe(78);
  });

  it('keeps a public rating the export already supplied', async () => {
    vi.mocked(lookupByImdbId).mockResolvedValue({
      tmdbId: 1, imdbId: 'tt1', posterPath: null, publicRating: 50,
    });

    const result = await enrichLibrary(
      [film({ id: 'imdb:tt1', title: 'X', imdbId: 'tt1', publicRating: 87, source: 'imdb' })],
      () => {},
    );

    expect(result[0]!.publicRating).toBe(87);
  });

  it('reports progress as it goes and finishes at the total', async () => {
    vi.mocked(searchByTitle).mockResolvedValue(null);
    const seen: number[] = [];

    await enrichLibrary(
      [film({ id: 'a', title: 'A' }), film({ id: 'b', title: 'B' }), film({ id: 'c', title: 'C' })],
      (progress) => seen.push(progress.done),
      { concurrency: 1 },
    );

    expect(seen.at(-1)).toBe(3);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('asks TMDB once per film even across two runs, thanks to the cache', async () => {
    vi.mocked(searchByTitle).mockResolvedValue({
      tmdbId: 7, imdbId: null, posterPath: '/p.jpg', publicRating: null,
    });

    const library = [film({ id: 'lb:x', title: 'X', year: 2000 })];
    await enrichLibrary(library, () => {});
    await enrichLibrary(library, () => {});

    expect(searchByTitle).toHaveBeenCalledTimes(1);
  });

  it('survives a film TMDB knows nothing about', async () => {
    vi.mocked(searchByTitle).mockResolvedValue(null);
    const result = await enrichLibrary([film({ id: 'lb:x', title: 'Unknown' })], () => {});
    expect(result).toHaveLength(1);
    expect(result[0]!.posterPath).toBeNull();
  });

  it('re-merges once enrichment gives a Letterboxd film its IMDb identifier', async () => {
    vi.mocked(lookupByImdbId).mockResolvedValue({
      tmdbId: 603, imdbId: 'tt0133093', posterPath: '/m.jpg', publicRating: 82,
    });
    vi.mocked(searchByTitle).mockResolvedValue({
      tmdbId: 603, imdbId: 'tt0133093', posterPath: '/m.jpg', publicRating: 82,
    });

    // Same film, two services, titles that do not normalize to the same string.
    const result = await enrichLibrary(
      [
        film({ id: 'imdb:tt0133093', title: 'The Matrix', imdbId: 'tt0133093', source: 'imdb' }),
        film({ id: 'lb:matrix', title: 'Matrix, The', year: 1999 }),
      ],
      () => {},
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.imdbId).toBe('tt0133093');
  });
});
```

The last test is the one that earns this module its `mergeLibraries` call, and it encodes a limitation the foundations plan knowingly left open.

- [ ] **Step 2: Run and confirm they fail**

Run: `npm run test:run -- tests/enrich/enrichLibrary.test.ts`
Expected: FAIL — cannot resolve `@/enrich/enrichLibrary`.

- [ ] **Step 3: Write the orchestrator**

`src/enrich/enrichLibrary.ts`:

```ts
import type { Film } from '@/domain/film';
import { mergeLibraries } from '@/domain/dedupe';
import { normalizeTitle } from '@/domain/normalize';
import { lookupByImdbId, searchByTitle, type TmdbMatch } from '@/services/tmdb';
import { getCached, putCached } from '@/services/tmdbCache';

export interface EnrichProgress {
  films: Film[];
  done: number;
  total: number;
}

/** Six at a time keeps TMDB comfortable and the browser responsive. */
const DEFAULT_CONCURRENCY = 6;

function cacheKey(film: Film): string {
  if (film.imdbId) return `imdb:${film.imdbId}`;
  return `title:${normalizeTitle(film.title)}::${film.year ?? 'unknown'}`;
}

async function resolve(film: Film): Promise<TmdbMatch | null> {
  const key = cacheKey(film);
  const cached = await getCached(key);
  if (cached !== undefined) return cached;

  const match = film.imdbId
    ? await lookupByImdbId(film.imdbId)
    : await searchByTitle(film.title, film.year);

  await putCached(key, match);
  return match;
}

/** Apply a match without ever displacing something the user's own export supplied. */
function applyMatch(film: Film, match: TmdbMatch | null): Film {
  if (!match) return film;
  return {
    ...film,
    tmdbId: film.tmdbId ?? match.tmdbId,
    imdbId: film.imdbId ?? match.imdbId,
    posterPath: film.posterPath ?? match.posterPath,
    publicRating: film.publicRating ?? match.publicRating,
  };
}

/**
 * Enrich every film, reporting progress as results arrive so the interface can
 * fill posters in rather than blocking on the whole run.
 *
 * The returned library is re-merged: enrichment can give a Letterboxd record an
 * IMDb identifier, which may reveal that two records are the same film after all.
 */
export async function enrichLibrary(
  films: Film[],
  onProgress: (progress: EnrichProgress) => void,
  options: { concurrency?: number } = {},
): Promise<Film[]> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const enriched = [...films];
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < films.length) {
      const index = next++;
      const film = films[index]!;
      enriched[index] = applyMatch(film, await resolve(film));
      done += 1;
      onProgress({ films: [...enriched], done, total: films.length });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, films.length) }, () => worker()),
  );

  return mergeLibraries(enriched);
}
```

- [ ] **Step 4: Run and confirm they pass**

Run: `npm run test:run -- tests/enrich/enrichLibrary.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm run test:run && npm run typecheck && npm run lint && npm run build
git add -A
git commit -m "feat(services): enrich the library from TMDB without blocking"
```

---

### Task 8: The library on screen

**Files:**
- Create: `src/ui/library/FilmCard.tsx`, `src/ui/library/FilmGrid.tsx`, `src/ui/library/LibrarySummary.tsx`
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/FilmCard.test.tsx`, `tests/ui/LibrarySummary.test.tsx`

**Interfaces:**
- Consumes: `Film`, `formatRating(normalized: number, scale: RatingScale): string`, `posterUrl(posterPath: string, size?): string`.
- Produces:
  - `<FilmCard film={Film} />`
  - `<FilmGrid films={Film[]} />`
  - `<LibrarySummary films={Film[]} warnings={string[]} enriching={{ done: number; total: number } | null} onReset={() => void} />`

- [ ] **Step 1: Write the failing card tests**

`tests/ui/FilmCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilmCard } from '@/ui/library/FilmCard';
import type { Film } from '@/domain/film';

function film(overrides: Partial<Film> = {}): Film {
  return {
    id: 'x', imdbId: null, tmdbId: null, title: 'The Matrix', year: 1999,
    rating: 90, ratingScale: 'imdb10', watchedAt: null, watchedAtIsApproximate: false,
    isRewatch: false, genres: [], directors: [], runtimeMinutes: null,
    publicRating: null, posterPath: null, source: 'imdb', ...overrides,
  };
}

describe('FilmCard', () => {
  it('shows the poster when there is one, described by the film title', () => {
    render(<FilmCard film={film({ posterPath: '/m.jpg' })} />);
    const image = screen.getByRole('img', { name: /the matrix/i });
    expect(image).toHaveAttribute('src', expect.stringContaining('/m.jpg'));
  });

  it('falls back to title and year when no poster has arrived', () => {
    render(<FilmCard film={film()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('The Matrix')).toBeInTheDocument();
    expect(screen.getByText('1999')).toBeInTheDocument();
  });

  it('renders an IMDb rating out of ten', () => {
    render(<FilmCard film={film({ rating: 90, ratingScale: 'imdb10' })} />);
    expect(screen.getByText('9/10')).toBeInTheDocument();
  });

  it('renders a Letterboxd rating as stars', () => {
    render(<FilmCard film={film({ rating: 70, ratingScale: 'letterboxd5' })} />);
    expect(screen.getByText('★★★½')).toBeInTheDocument();
  });

  it('says nothing about a rating the user never gave', () => {
    render(<FilmCard film={film({ rating: null })} />);
    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });
});
```

The last two tests protect the product's central honesty: a film's rating is shown in the scale the user actually used, and an unrated film is not given a score it never had.

- [ ] **Step 2: Run and confirm they fail**

Run: `npm run test:run -- tests/ui/FilmCard.test.tsx`
Expected: FAIL — cannot resolve `@/ui/library/FilmCard`.

- [ ] **Step 3: Write the card**

`src/ui/library/FilmCard.tsx`:

```tsx
import type { Film } from '@/domain/film';
import { formatRating } from '@/domain/rating';
import { posterUrl } from '@/services/tmdb';

interface FilmCardProps {
  film: Film;
}

export function FilmCard({ film }: FilmCardProps) {
  return (
    <figure className="group relative overflow-hidden rounded-card bg-surface">
      <div className="aspect-[2/3] w-full">
        {film.posterPath ? (
          <img
            src={posterUrl(film.posterPath)}
            alt={film.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col justify-end p-3">
            <span className="text-sm font-medium leading-tight">{film.title}</span>
            {film.year !== null && (
              <span className="mt-1 text-xs text-ink-dim">{film.year}</span>
            )}
          </div>
        )}
      </div>

      {film.rating !== null && (
        <figcaption className="absolute right-1.5 top-1.5 rounded bg-screen/85 px-1.5 py-0.5 text-xs font-medium">
          {formatRating(film.rating, film.ratingScale)}
        </figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 4: Run and confirm they pass**

Run: `npm run test:run -- tests/ui/FilmCard.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing summary tests**

`tests/ui/LibrarySummary.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibrarySummary } from '@/ui/library/LibrarySummary';
import type { Film } from '@/domain/film';

function film(id: string, rating: number | null): Film {
  return {
    id, imdbId: null, tmdbId: null, title: id, year: 2000, rating,
    ratingScale: 'imdb10', watchedAt: null, watchedAtIsApproximate: false,
    isRewatch: false, genres: [], directors: [], runtimeMinutes: null,
    publicRating: null, posterPath: null, source: 'imdb',
  };
}

const films = [film('a', 90), film('b', null)];

describe('LibrarySummary', () => {
  it('counts the library and how much of it is rated', () => {
    render(<LibrarySummary films={films} warnings={[]} enriching={null} onReset={vi.fn()} />);
    expect(screen.getByText(/2 films/)).toBeInTheDocument();
    expect(screen.getByText(/1 rated/)).toBeInTheDocument();
  });

  it('shows enrichment progress while it is running, and not after', () => {
    const { rerender } = render(
      <LibrarySummary films={films} warnings={[]} enriching={{ done: 1, total: 2 }} onReset={vi.fn()} />,
    );
    expect(screen.getByText(/finding posters/i)).toBeInTheDocument();

    rerender(<LibrarySummary films={films} warnings={[]} enriching={null} onReset={vi.fn()} />);
    expect(screen.queryByText(/finding posters/i)).not.toBeInTheDocument();
  });

  it('surfaces import warnings rather than hiding them', () => {
    render(
      <LibrarySummary films={films} warnings={['Skipped a row: "Broken".']} enriching={null} onReset={vi.fn()} />,
    );
    expect(screen.getByText(/Skipped a row/)).toBeInTheDocument();
  });

  it('offers a way to start over', async () => {
    const onReset = vi.fn();
    render(<LibrarySummary films={films} warnings={[]} enriching={null} onReset={onReset} />);
    await userEvent.click(screen.getByRole('button', { name: /import a different/i }));
    expect(onReset).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run and confirm they fail**

Run: `npm run test:run -- tests/ui/LibrarySummary.test.tsx`
Expected: FAIL — cannot resolve `@/ui/library/LibrarySummary`.

- [ ] **Step 7: Write the summary**

`src/ui/library/LibrarySummary.tsx`:

```tsx
import type { Film } from '@/domain/film';

interface LibrarySummaryProps {
  films: Film[];
  warnings: string[];
  enriching: { done: number; total: number } | null;
  onReset: () => void;
}

export function LibrarySummary({ films, warnings, enriching, onReset }: LibrarySummaryProps) {
  const rated = films.filter((film) => film.rating !== null).length;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-line pb-4">
      <p className="text-lg">
        <span className="font-semibold">{films.length} films</span>
        <span className="text-ink-dim"> · {rated} rated</span>
      </p>

      {enriching && (
        <p className="text-sm text-ink-dim" aria-live="polite">
          Finding posters… {enriching.done} of {enriching.total}
        </p>
      )}

      <button
        type="button"
        onClick={onReset}
        className="ml-auto text-sm text-ink-dim underline underline-offset-4 hover:text-ink"
      >
        Import a different export
      </button>

      {warnings.length > 0 && (
        <details className="w-full text-sm text-ink-dim">
          <summary className="cursor-pointer">
            {warnings.length} row{warnings.length === 1 ? '' : 's'} could not be read
          </summary>
          <ul className="mt-2 space-y-1">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run and confirm they pass**

Run: `npm run test:run -- tests/ui/LibrarySummary.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 9: Write the grid**

`src/ui/library/FilmGrid.tsx`. Virtualized, because a large library is thousands of posters and rendering them all makes scrolling stutter:

```tsx
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Film } from '@/domain/film';
import { FilmCard } from './FilmCard';

interface FilmGridProps {
  films: Film[];
  columns?: number;
}

const ROW_HEIGHT = 232;

export function FilmGrid({ films, columns = 6 }: FilmGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(films.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  return (
    <div ref={scrollRef} className="h-[70vh] overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className="absolute left-0 grid w-full gap-3"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              transform: `translateY(${row.start}px)`,
            }}
          >
            {films.slice(row.index * columns, row.index * columns + columns).map((film) => (
              <FilmCard key={film.id} film={film} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Wire the library screen into the app**

Replace the placeholder branch in `src/ui/App.tsx` so that importing starts enrichment immediately and the grid renders straight away:

```tsx
import { useCallback, useState } from 'react';
import { Shell } from './Shell';
import { SourcePicker, type ImportSource } from './import/SourcePicker';
import { ImportGuide } from './import/ImportGuide';
import { FilmGrid } from './library/FilmGrid';
import { LibrarySummary } from './library/LibrarySummary';
import { enrichLibrary } from '@/enrich/enrichLibrary';
import type { ImportOutcome } from './import/importFiles';
import type { Film } from '@/domain/film';

export default function App() {
  const [source, setSource] = useState<ImportSource | null>(null);
  const [films, setFilms] = useState<Film[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null);

  const onImported = useCallback(async (outcome: ImportOutcome) => {
    if (outcome.status !== 'ok') return;
    setFilms(outcome.films);
    setWarnings(outcome.warnings);
    setEnriching({ done: 0, total: outcome.films.length });

    const enriched = await enrichLibrary(outcome.films, (progress) => {
      setFilms(progress.films);
      setEnriching({ done: progress.done, total: progress.total });
    });

    setFilms(enriched);
    setEnriching(null);
  }, []);

  function reset() {
    setFilms(null);
    setWarnings([]);
    setEnriching(null);
    setSource(null);
  }

  if (films !== null) {
    return (
      <Shell>
        <div className="mx-auto max-w-6xl space-y-4 px-6 py-8">
          <LibrarySummary films={films} warnings={warnings} enriching={enriching} onReset={reset} />
          <FilmGrid films={films} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-6 py-16">
        {source === null ? (
          <>
            <h1 className="mb-3 text-center text-3xl font-semibold tracking-tight">
              Turn your film history into a tier list
            </h1>
            <p className="mb-10 text-center text-ink-dim">Where do you keep your films?</p>
            <SourcePicker onPick={setSource} />
          </>
        ) : (
          <ImportGuide
            source={source}
            onBack={() => setSource(null)}
            onImported={(outcome) => void onImported(outcome)}
          />
        )}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 11: Watch it work with a real export**

```bash
npm run dev
```

Drop a real export. Confirm the grid appears **immediately** with typographic cards and that posters fill in progressively rather than the page blocking. Record roughly how long the first cards took to appear and how long enrichment took overall. If the grid does not appear until enrichment finishes, the non-blocking design has been lost somewhere — report it rather than accepting it.

- [ ] **Step 12: Verify and commit**

```bash
npm run test:run && npm run test:coverage && npm run typecheck && npm run lint && npm run build
git add -A
git commit -m "feat(ui): show the imported library as a poster grid"
```

---

### Task 9: Keeping the library across visits

**Files:**
- Create: `src/services/library.ts`
- Modify: `src/ui/App.tsx`
- Test: `tests/services/library.test.ts`

**Interfaces:**
- Consumes: `db()` and `resetDatabase()` (Task 6), `Film`.
- Produces:
  - `saveLibrary(films: Film[]): Promise<void>`
  - `loadLibrary(): Promise<Film[] | null>`
  - `clearLibrary(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`tests/services/library.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveLibrary, loadLibrary, clearLibrary } from '@/services/library';
import { resetDatabase } from '@/services/db';
import type { Film } from '@/domain/film';

function film(id: string, watchedAt: Date | null = null): Film {
  return {
    id, imdbId: null, tmdbId: null, title: id, year: 2000, rating: 80,
    ratingScale: 'imdb10', watchedAt, watchedAtIsApproximate: false,
    isRewatch: false, genres: [], directors: [], runtimeMinutes: null,
    publicRating: null, posterPath: null, source: 'imdb',
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe('library persistence', () => {
  it('reports nothing when nothing was ever saved', async () => {
    expect(await loadLibrary()).toBeNull();
  });

  it('round-trips a library', async () => {
    await saveLibrary([film('a'), film('b')]);
    const restored = await loadLibrary();
    expect(restored?.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('restores watch dates as Date objects, not strings', async () => {
    await saveLibrary([film('a', new Date('2025-03-09'))]);
    const restored = await loadLibrary();
    expect(restored![0]!.watchedAt).toBeInstanceOf(Date);
    expect(restored![0]!.watchedAt!.toISOString()).toContain('2025-03-09');
  });

  it('forgets the library when asked', async () => {
    await saveLibrary([film('a')]);
    await clearLibrary();
    expect(await loadLibrary()).toBeNull();
  });
});
```

The `Date` test matters: structured clone preserves `Date`, but a future change routing this through JSON would silently turn every watch date into a string, and every date filter would then compare a string to a `Date` and quietly match nothing.

- [ ] **Step 2: Run and confirm they fail**

Run: `npm run test:run -- tests/services/library.test.ts`
Expected: FAIL — cannot resolve `@/services/library`.

- [ ] **Step 3: Write the store**

`src/services/library.ts`:

```ts
import { db } from './db';
import type { Film } from '@/domain/film';

const KEY = 'current';

/**
 * Persist the whole library. IndexedDB stores structured clones, so Date
 * objects survive as Dates — do not route this through JSON.
 */
export async function saveLibrary(films: Film[]): Promise<void> {
  await (await db()).put('library', { films, savedAt: Date.now() }, KEY);
}

export async function loadLibrary(): Promise<Film[] | null> {
  const entry = await (await db()).get('library', KEY);
  return entry?.films ?? null;
}

export async function clearLibrary(): Promise<void> {
  await (await db()).delete('library', KEY);
}
```

- [ ] **Step 4: Run and confirm they pass**

Run: `npm run test:run -- tests/services/library.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Restore on load and save after enrichment**

In `src/ui/App.tsx`, add a restore on first render and persist once enrichment settles:

```tsx
  useEffect(() => {
    void loadLibrary().then((restored) => {
      if (restored) setFilms(restored);
    });
  }, []);
```

In `onImported`, after `setFilms(enriched); setEnriching(null);`:

```tsx
    await saveLibrary(enriched);
```

And in `reset`, clear the stored copy too:

```tsx
  function reset() {
    void clearLibrary();
    setFilms(null);
    setWarnings([]);
    setEnriching(null);
    setSource(null);
  }
```

Import `useEffect` from React and the three functions from `@/services/library`.

- [ ] **Step 6: Confirm it survives a reload**

```bash
npm run dev
```

Import an export, wait for posters, reload the page. The library must come back without re-importing, and without re-fetching every poster — the cache from Task 6 covers that. Then use "Import a different export" and confirm a reload afterwards shows the import screen, not the old library.

- [ ] **Step 7: Verify and commit**

```bash
npm run test:run && npm run test:coverage && npm run typecheck && npm run lint && npm run build
git add -A
git commit -m "feat(services): keep the imported library across visits"
```

- [ ] **Step 8: Update the changelog and the README status line**

`CHANGELOG.md`, under `## [Unreleased]` / `### Added`:

```markdown
- Import screen: drop an IMDb `ratings.csv` or a Letterboxd export `.zip` and see your library.
- Posters and public ratings from TMDB, filled in progressively and cached locally.
- The imported library is remembered between visits.
```

In `README.md`, replace the status line added at the end of the foundations plan with:

```markdown
> **Status:** in development — importing and browsing your library work today. Filtering and the tier board land next.
```

- [ ] **Step 9: Commit the documentation**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: record the import and library work"
```

---

## Definition of done

- [ ] A visitor can drop an IMDb `ratings.csv` or a Letterboxd `.zip` on the deployed page and see their own films.
- [ ] The grid renders immediately with typographic cards; posters fill in progressively and never block it.
- [ ] Ratings are shown in the scale the user actually used, and unrated films show no rating.
- [ ] An unrecognisable file produces a message naming the file and a hint saying what to drop instead.
- [ ] Importing both services produces one library, with films that appear in both merged — including films that only match once TMDB supplies an IMDb identifier.
- [ ] The library and the poster cache survive a reload; "Import a different export" clears both.
- [ ] The footer carries the TMDB attribution and the statement that ratings never leave the browser.
- [ ] `npm run test:run`, `npm run test:coverage`, `npm run typecheck`, `npm run lint` and `npm run build` all pass, with coverage at or above the configured gates.
- [ ] No secret has entered git history: searching `git log -p` for the key value finds nothing.
- [ ] CI and the Pages deployment are green on `main`.
