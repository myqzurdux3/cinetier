import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import App from '@/ui/App';
import { loadLibrary, saveLibrary, clearLibrary } from '@/services/library';
import { enrichLibrary, type EnrichProgress } from '@/enrich/enrichLibrary';
import { loadFilters, saveFilters, clearFilters } from '@/services/filters';
import type { FilterCriteria } from '@/domain/filters';
import { enrichDetails, countPendingDetails } from '@/enrich/enrichDetails';
import { importFiles, type ImportOutcome } from '@/ui/import/importFiles';
import type { Film } from '@/domain/film';
import { saveBoard, loadFirstBoard, clearBoards } from '@/services/boards';
import { createBoard, moveFilm, type TierBoard } from '@/domain/tiers';

vi.mock('@/services/library', () => ({
  loadLibrary: vi.fn(),
  saveLibrary: vi.fn(),
  clearLibrary: vi.fn(),
}));

vi.mock('@/enrich/enrichLibrary', () => ({
  enrichLibrary: vi.fn(),
}));

vi.mock('@/services/filters', () => ({
  loadFilters: vi.fn(),
  saveFilters: vi.fn(),
  clearFilters: vi.fn(),
}));

vi.mock('@/enrich/enrichDetails', () => ({
  enrichDetails: vi.fn(),
  countPendingDetails: vi.fn(),
}));

vi.mock('@/services/boards', () => ({
  saveBoard: vi.fn(),
  loadFirstBoard: vi.fn(),
  clearBoards: vi.fn(),
}));

// Real by default — this file otherwise deliberately drives real parsing
// (see importFixture() below) — wrapped only so one test (Path A, in the
// "App enrichment races" section) can delay a single call to reproduce a
// restore resolving *during* an in-flight file read, which nothing else in
// this file can control.
vi.mock('@/ui/import/importFiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/import/importFiles')>();
  return { ...actual, importFiles: vi.fn(actual.importFiles) };
});

const imdbCsv = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');

function film(id: string, overrides: Partial<Film> = {}): Film {
  return {
    id,
    imdbId: null,
    tmdbId: null,
    title: id,
    year: 2000,
    titleType: 'movie',
    rating: 80,
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

/** A promise this test can settle by hand, to control timing precisely. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Drives a real import through the actual parser pipeline, no mocking needed. */
async function importFixture() {
  await userEvent.click(screen.getByRole('button', { name: /imdb/i }));
  const input = screen.getByLabelText(/choose a file/i);
  await userEvent.upload(input, new File([imdbCsv], 'ratings.csv', { type: 'text/csv' }));
}

/**
 * "Import a different export" now only opens the confirmation dialog — reset
 * itself happens on its destructive action. Every test below that means "and
 * actually reset" goes through both clicks.
 */
async function resetLibrary() {
  const resetButton = await screen.findByRole('button', { name: /import a different export/i });
  await userEvent.click(resetButton);
  await userEvent.click(screen.getByRole('button', { name: /delete everything/i }));
}

// jsdom reports every element's size as 0, so @tanstack/react-virtual's
// viewport measurement (offsetHeight/offsetWidth) sees an empty scroll
// container and FilmGrid renders no rows at all — see tests/ui/FilmGrid.test.tsx
// for the same stub. The new filter-rail tests below assert on film titles
// that FilmGrid renders, so they need it here too.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 });
});

beforeEach(() => {
  vi.mocked(loadLibrary).mockReset().mockResolvedValue(null);
  vi.mocked(saveLibrary).mockReset().mockResolvedValue(undefined);
  vi.mocked(clearLibrary).mockReset().mockResolvedValue(undefined);
  // Default: resolve immediately, passing films through unchanged, so tests
  // that don't care about enrichment timing don't have to manage it.
  vi.mocked(enrichLibrary)
    .mockReset()
    .mockImplementation(async (films, onProgress) => {
      onProgress({ films, done: films.length, total: films.length });
      return films;
    });

  // None of these tests starts filtered unless it says so explicitly.
  vi.mocked(loadFilters).mockReset().mockResolvedValue(null);
  vi.mocked(saveFilters).mockReset().mockResolvedValue(undefined);
  vi.mocked(clearFilters).mockReset().mockResolvedValue(undefined);

  // Default: nothing pending, so tests that don't care about the details pass
  // don't have to manage it — every film() fixture carries tmdbId: null, which
  // never needs details in the real pass either. Tests that want to see the
  // pass run set this explicitly.
  vi.mocked(countPendingDetails).mockReset().mockReturnValue(0);
  vi.mocked(enrichDetails)
    .mockReset()
    .mockImplementation(async (films, onProgress) => {
      onProgress({ films, done: films.length, total: films.length });
      return films;
    });

  // Cleared, not reset: this mock's factory-time implementation already
  // calls through to the real parser (see the vi.mock call above), and
  // mockReset() would wipe that out for every test, not just the one that
  // deliberately overrides it.
  vi.mocked(importFiles).mockClear();

  // None of these tests starts with a restored board unless it says so
  // explicitly.
  vi.mocked(loadFirstBoard).mockReset().mockResolvedValue(null);
  vi.mocked(saveBoard).mockReset().mockResolvedValue(undefined);
  vi.mocked(clearBoards).mockReset().mockResolvedValue(undefined);
});

describe('App persistence', () => {
  it('restores the saved library on mount', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a'), film('b')]);

    render(<App />);

    await waitFor(() => expect(loadLibrary).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: /import a different export/i }),
    ).toBeInTheDocument();
    // An exact string, not /2 films/: the pool's "N films to place" and the
    // pre-fill summary's "would place N films" both *contain* that phrase once
    // the board renders alongside the header, and both have broken this
    // assertion at different points in this file's life. Only the header's own
    // span reads exactly "2 films".
    expect(screen.getByText('2 films', { selector: 'span' })).toBeInTheDocument();
  });

  it('saves the enriched library only after enrichment settles, not before', async () => {
    const enrichDeferred = deferred<Film[]>();
    vi.mocked(enrichLibrary).mockReturnValue(enrichDeferred.promise);

    render(<App />);
    await importFixture();

    await waitFor(() => expect(enrichLibrary).toHaveBeenCalled());
    expect(saveLibrary).not.toHaveBeenCalled();

    const enriched = [film('enriched')];
    enrichDeferred.resolve(enriched);

    await waitFor(() => expect(saveLibrary).toHaveBeenCalledWith(enriched));
  });

  it('clears the stored library on reset and returns to the import screen', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a')]);
    render(<App />);

    await resetLibrary();

    expect(clearLibrary).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /imdb/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /import a different export/i }),
    ).not.toBeInTheDocument();
  });

  it('does not let a stale restore repopulate the screen after a reset', async () => {
    // The restore promise from mount is still pending when the user imports,
    // waits for enrichment to save, and then resets — exactly the trace in
    // the review finding this test was written to catch.
    const restoreDeferred = deferred<Film[] | null>();
    vi.mocked(loadLibrary).mockReturnValue(restoreDeferred.promise);

    render(<App />);
    await importFixture();

    await resetLibrary();
    expect(screen.getByRole('button', { name: /imdb/i })).toBeInTheDocument();

    // The stale restore now resolves with the library the user just discarded.
    restoreDeferred.resolve([film('stale')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      screen.queryByRole('button', { name: /import a different export/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /imdb/i })).toBeInTheDocument();
  });

  it('logs rather than throwing when the restore itself fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadLibrary).mockRejectedValue(new Error('IndexedDB is unavailable'));

    render(<App />);

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    // No crash, and no phantom library: the import screen is still there.
    expect(screen.getByRole('button', { name: /imdb/i })).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('logs rather than throwing when clearing the stored library fails on reset', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadLibrary).mockResolvedValue([film('a')]);
    vi.mocked(clearLibrary).mockRejectedValue(new Error('IndexedDB is unavailable'));

    render(<App />);
    await resetLibrary();

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    // The screen still resets even though the underlying delete failed.
    expect(screen.getByRole('button', { name: /imdb/i })).toBeInTheDocument();

    consoleError.mockRestore();
  });
});

describe('App shell', () => {
  it('does not print the header tagline a second time on the landing screen', () => {
    // The header carries a tagline of its own from `sm` up. The landing screen
    // makes its own, differently worded, case for the product below the fold —
    // a literal second copy of the header's sentence would read as a rendering
    // mistake.
    render(<App />);
    expect(screen.getAllByText(/rank what you have already seen/i)).toHaveLength(1);
  });

  it('renders the actual landing screen, not just a bare source picker, on the opening screen', () => {
    // Landing is well tested in isolation, but nothing outside Landing.test.tsx
    // proves App actually wires it in rather than still rendering the old bare
    // SourcePicker. Assert the content that only Landing supplies: the level-1
    // heading (exactly one), the tier band with its six letters, and the
    // privacy line promoted out of the footer's fine print.
    render(<App />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/cinetier/i);

    const band = screen.getByTestId('tier-band');
    expect(Array.from(band.children).map((el) => el.textContent)).toEqual([
      'S',
      'A',
      'B',
      'C',
      'D',
      'F',
    ]);

    // The privacy line is deliberately repeated: once promoted onto the
    // landing screen itself, and once in the footer's fine print underneath
    // every screen. Both copies are expected here, not a rendering mistake.
    expect(screen.getAllByText(/never leave your browser/i)).toHaveLength(2);
  });
});

describe('App enrichment races', () => {
  /**
   * Hands the test control of every enrichLibrary call: the promise it returned
   * and the progress callback it was given, so a run can be made to report and
   * settle long after the user has moved on.
   */
  function captureEnrichRuns() {
    const runs: {
      films: Film[];
      onProgress: (progress: EnrichProgress) => void;
      resolve: (films: Film[]) => void;
    }[] = [];

    vi.mocked(enrichLibrary).mockImplementation((films, onProgress) => {
      const settled = deferred<Film[]>();
      runs.push({ films, onProgress, resolve: settled.resolve });
      return settled.promise;
    });

    return runs;
  }

  function library(size: number): Film[] {
    return Array.from({ length: size }, (_, index) => film(`f${index}`));
  }

  it('ignores a run that reports progress after the user has reset', async () => {
    const runs = captureEnrichRuns();

    render(<App />);
    await importFixture();

    await resetLibrary();
    expect(screen.getByRole('button', { name: /imdb/i })).toBeInTheDocument();

    // The discarded run keeps resolving films one by one, then finishes.
    const stale = library(3);
    act(() => {
      runs[0]!.onProgress({ films: stale, done: 1, total: 3 });
    });
    expect(
      screen.queryByRole('button', { name: /import a different export/i }),
    ).not.toBeInTheDocument();

    runs[0]!.resolve(stale);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The import screen is still there, and the discarded library was never
    // written back over the storage the reset just cleared.
    expect(screen.getByRole('button', { name: /imdb/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /import a different export/i }),
    ).not.toBeInTheDocument();
    expect(saveLibrary).not.toHaveBeenCalled();
  });

  it('keeps the second import when the first is still enriching', async () => {
    const runs = captureEnrichRuns();

    render(<App />);
    await importFixture();

    await resetLibrary();
    await importFixture();
    await waitFor(() => expect(runs).toHaveLength(2));

    const fresh = library(1);
    runs[1]!.resolve(fresh);
    await waitFor(() => expect(saveLibrary).toHaveBeenCalledWith(fresh));
    expect(screen.getByText(/1 films/)).toBeInTheDocument();

    // Only now does the abandoned first run report and finish.
    const stale = library(3);
    act(() => {
      runs[0]!.onProgress({ films: stale, done: 3, total: 3 });
    });
    runs[0]!.resolve(stale);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText(/1 films/)).toBeInTheDocument();
    expect(screen.queryByText(/3 films/)).not.toBeInTheDocument();
    expect(saveLibrary).toHaveBeenCalledTimes(1);
    expect(saveLibrary).not.toHaveBeenCalledWith(stale);
  });

  it('logs rather than throwing when saving the enriched library fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(saveLibrary).mockRejectedValue(new Error('IndexedDB is unavailable'));

    render(<App />);
    await importFixture();

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    // The library the user just imported is still on screen.
    expect(screen.getByRole('button', { name: /import a different export/i })).toBeInTheDocument();

    consoleError.mockRestore();
  });
});

describe('App filter rail', () => {
  it('filters the grid by the restored criteria', async () => {
    // Restored criteria have to reach the grid, not merely the rail: a rail
    // that shows a filter the grid ignores is worse than no rail.
    vi.mocked(loadLibrary).mockResolvedValue([
      film('a', { title: 'Kept', rating: 90 }),
      film('b', { title: 'Cut', rating: 10 }),
    ]);
    vi.mocked(loadFilters).mockResolvedValue({ minRating: 80 });

    render(<App />);

    expect(await screen.findByText('Kept')).toBeInTheDocument();
    // Both the loadFilters and loadLibrary restores are async, and nothing
    // guarantees which settles first — assert this like any other eventual
    // state, not as a synchronous fact that merely happens to hold today
    // because of effect declaration order.
    await waitFor(() => expect(screen.queryByText('Cut')).not.toBeInTheDocument());
    expect(screen.getByText('1 of 2 titles')).toBeInTheDocument();
  });

  it('saves the criteria as they change', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Kept', rating: 90 })]);
    vi.mocked(loadFilters).mockResolvedValue(null);
    render(<App />);
    await screen.findByText('Kept');

    fireEvent.change(screen.getByLabelText('Minimum rating'), { target: { value: '50' } });

    await waitFor(() => {
      expect(saveFilters).toHaveBeenCalledWith(expect.objectContaining({ minRating: 50 }));
    });
  });

  it('forgets the criteria when the last one is cleared', async () => {
    // Rather than persisting an empty object, which would restore as a
    // filtered view that admits everything.
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Kept', rating: 90 })]);
    vi.mocked(loadFilters).mockResolvedValue({ minRating: 80 });
    render(<App />);
    await screen.findByText('Kept');

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    await waitFor(() => {
      expect(clearFilters).toHaveBeenCalled();
    });
  });

  it('shows the library when the criteria cannot be read at all', async () => {
    // Private browsing, a blocked database, a failed upgrade. Losing a
    // preference must not cost the page. Also asserts the rejection was
    // actually caught (not merely harmless in this run): an unhandled
    // rejection wouldn't fail this expectation, only the test file as a
    // whole, which would point at the wrong line.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Kept', rating: 90 })]);
    vi.mocked(loadFilters).mockRejectedValue(new Error('storage is blocked'));

    render(<App />);

    expect(await screen.findByText('Kept')).toBeInTheDocument();
    await waitFor(() => expect(consoleError).toHaveBeenCalled());

    consoleError.mockRestore();
  });

  it('does not reinstate criteria from a filters restore that resolves after an import wins', async () => {
    // Mirrors "does not let a stale restore repopulate the screen after a
    // reset" for the library restore below: the filters restore has the
    // identical failure mode (a slow promise outliving the action that
    // should pre-empt it) and needs the identical restoreCancelled guard.
    const filtersDeferred = deferred<FilterCriteria | null>();
    vi.mocked(loadFilters).mockReturnValue(filtersDeferred.promise);

    render(<App />);
    await importFixture();
    await screen.findByRole('button', { name: /import a different export/i });

    // The stale restore now resolves with criteria that would exclude
    // everything the user just imported, if it were allowed to apply.
    filtersDeferred.resolve({ minRating: 999 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('Nothing matches these filters.')).not.toBeInTheDocument();
  });

  it('explains an empty result instead of showing an empty grid', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Kept', rating: 10 })]);
    vi.mocked(loadFilters).mockResolvedValue({ minRating: 90 });

    render(<App />);

    expect(await screen.findByText('Nothing matches these filters.')).toBeInTheDocument();
  });

  it('keeps the board on screen when the filters admit nothing', async () => {
    // The rail narrows the pool and nothing else: a row keeps its films
    // whatever the criteria say. Replacing the whole board with the
    // explanation — which is what used to happen — made one criterion too many
    // look like the ranking had been lost.
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Kept', rating: 10 })]);
    vi.mocked(loadFilters).mockResolvedValue({ minRating: 90 });

    render(<App />);

    expect(await screen.findByText('Nothing matches these filters.')).toBeInTheDocument();
    // Every default row, still there, still droppable.
    for (const label of ['S', 'A', 'B', 'C', 'D', 'F']) {
      expect(screen.getByRole('list', { name: new RegExp(`^${label} —`) })).toBeInTheDocument();
    }
  });

  it('does not show the empty-library explainer for a genuinely empty library', async () => {
    // Distinct from the case above: no criterion is active, so `visible` is
    // empty because the library itself is, not because a filter cut it. The
    // rail's "Nothing matches these filters" message would be the wrong
    // explanation, and its "Clear all filters" button would clear nothing.
    vi.mocked(loadLibrary).mockResolvedValue([]);
    vi.mocked(loadFilters).mockResolvedValue(null);

    render(<App />);

    // A positive marker that the library screen actually rendered — not
    // merely that loadLibrary was called, which is satisfied the instant the
    // effect fires and says nothing about what ended up on screen.
    await screen.findByRole('button', { name: /import a different export/i });
    expect(screen.queryByText('Nothing matches these filters.')).not.toBeInTheDocument();
  });

  it(
    'never shows two buttons named "Clear all filters" at once, and keeps announcing ' +
      'the count when results drop to zero',
    async () => {
      // FilterStatus's own clear-all chip and NoResults's clear-all button
      // are both accessible-name "Clear all filters" — if both mounted at
      // once, `getByRole('button', { name: 'Clear all filters' })`, used by
      // "forgets the criteria when the last one is cleared" above, would
      // throw on an ambiguous match. FilterStatus itself, though, must never
      // unmount over this transition: its live region is what announces the
      // count dropping to zero, and an unmount-remount announces nothing to
      // a screen reader even though a fresh query would still find a node.
      vi.mocked(loadLibrary).mockResolvedValue([
        film('a', { title: 'Kept', rating: 90 }),
        film('b', { title: 'Cut', rating: 10 }),
      ]);
      vi.mocked(loadFilters).mockResolvedValue(null);

      render(<App />);
      await screen.findByText('Kept');

      // Captured once, reused below rather than re-queried — identity is
      // part of the contract, the same as FilterStatus's own unit test.
      const region = screen.getByText('2 of 2 titles');

      fireEvent.change(screen.getByLabelText('Minimum rating'), { target: { value: '95' } });

      await screen.findByText('Nothing matches these filters.');
      expect(region).toBeInTheDocument();
      expect(region).toHaveTextContent('0 of 2 titles');
      expect(screen.getAllByRole('button', { name: 'Clear all filters' })).toHaveLength(1);
    },
  );

  it('runs the details pass over a restored library', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Kept', rating: 90 })]);
    vi.mocked(loadFilters).mockResolvedValue(null);
    // Simulates a record with pending details — every film() fixture has
    // tmdbId: null, which the real countPendingDetails would treat as never
    // pending, so this is overridden here rather than in the shared default.
    vi.mocked(countPendingDetails).mockReturnValue(1);

    render(<App />);
    await screen.findByText('Kept');

    await waitFor(() => {
      expect(enrichDetails).toHaveBeenCalled();
    });
  });

  it('runs the details pass over a freshly imported library, using what enrichment produced', async () => {
    // Pins the ordering this pass documents for itself: details run after
    // the poster pass, over its output — not beside it, and not over the
    // raw parsed import.
    const enriched = [film('with-poster', { title: 'Heat', posterPath: '/heat.jpg' })];
    vi.mocked(enrichLibrary).mockImplementation(async (_films, onProgress) => {
      onProgress({ films: enriched, done: enriched.length, total: enriched.length });
      return enriched;
    });
    vi.mocked(countPendingDetails).mockReturnValue(1);

    render(<App />);
    await importFixture();

    await waitFor(() => expect(enrichDetails).toHaveBeenCalled());
    expect(vi.mocked(enrichDetails).mock.calls[0]![0]).toBe(enriched);
  });

  it('re-enables the detail sections when a restore, abandoned by an in-flight import, is superseded — no reset() involved', async () => {
    // Path A (DropZone.tsx:25-30): `handle` awaits importFiles(files) — a
    // file read plus a parse — with no mount check and no staleness check
    // before calling onImported. Reproduced here by holding that one call:
    // the restore resolves and starts its own details pass *while* an
    // already-started import is still "reading" its file, the import screen
    // unmounts under it, and only once the held read finishes does
    // onImported fire and abandon the restore's pass — reset() never runs
    // anywhere in this sequence. The abandoned run's own countPendingDetails
    // found 5 pending before it was abandoned, so its early return (were one
    // to fire) is irrelevant here — this is the *other* early return, the
    // superseding import's own, at App.tsx's `if (total === 0) return;`,
    // which is reached before the new runId guard and depends entirely on
    // onImported's own unconditional clear to not leave the restore's stale
    // {0, 5} frozen on screen.
    const restoreDeferred = deferred<Film[] | null>();
    vi.mocked(loadLibrary).mockReturnValue(restoreDeferred.promise);
    vi.mocked(loadFilters).mockResolvedValue(null);
    const importDeferred = deferred<ImportOutcome>();
    vi.mocked(importFiles).mockReturnValueOnce(importDeferred.promise);
    vi.mocked(countPendingDetails).mockReturnValueOnce(5).mockReturnValueOnce(0);
    const restorePass = deferred<Film[]>();
    vi.mocked(enrichDetails).mockImplementationOnce(() => restorePass.promise);

    render(<App />);

    // Start the import while films is still null — the restore hasn't
    // resolved yet — so this reaches DropZone's `handle` and parks it at
    // `await importFiles(...)` before onImported is ever called.
    await userEvent.click(screen.getByRole('button', { name: /imdb/i }));
    const input = screen.getByLabelText(/choose a file/i);
    await userEvent.upload(input, new File([imdbCsv], 'ratings.csv', { type: 'text/csv' }));
    expect(importFiles).toHaveBeenCalledTimes(1);

    // The restore resolves next, entirely independent of the import still in
    // flight above it: it sets films, starts its own pass (5 pending), and
    // the screen switches to the library view — unmounting the DropZone
    // instance whose `handle` call is still parked, mid-file-read, above.
    restoreDeferred.resolve([film('a', { title: 'Old', rating: 90 })]);
    await screen.findByText('Old');
    await waitFor(() => {
      expect(screen.getAllByText(/Looking up genres and directors… 5 to go/)).toHaveLength(3);
    });

    // The held file read now finishes: DropZone's (unmounted) `handle` calls
    // onImported, which abandons the restore's still-running pass and starts
    // its own — finding nothing pending, since TMDB is unreachable in this
    // outcome.
    importDeferred.resolve({
      status: 'ok',
      films: [film('b', { title: 'New', rating: 80 })],
      warnings: [],
      skipped: 0,
    });

    await screen.findByText('New');
    await waitFor(() => {
      expect(screen.queryByText(/Looking up genres and directors/)).not.toBeInTheDocument();
    });
  });

  it('does not run a details pass in the background, or re-arm its progress, for a run that has already been abandoned', async () => {
    // A second, independent path to the same symptom (App.tsx's own comment
    // on fillInDetails calls it Path B): onImported re-checks runId before
    // awaiting saveLibrary but not after, so a reset() landing inside that
    // wait can clear fetchingDetails only for the *stale* run's own
    // fillInDetails — invoked here for the first time only once the held
    // save below resolves, well after abandonment — to proceed anyway and
    // start a full TMDB details pass for a library nobody will ever see,
    // re-arming fetchingDetails right after reset() just cleared it. The
    // guard fixes this at its root, independent of the other fix above:
    // reverting it alone (with that fix intact) still turns this test red.
    const held = deferred<void>();
    vi.mocked(saveLibrary).mockReturnValueOnce(held.promise);
    vi.mocked(countPendingDetails).mockReturnValue(5);

    render(<App />);
    await importFixture();
    await waitFor(() => expect(saveLibrary).toHaveBeenCalled());

    await resetLibrary();

    held.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(enrichDetails).not.toHaveBeenCalled();
    expect(screen.queryByText(/Looking up genres and directors/)).not.toBeInTheDocument();
  });

  it('logs a failed details pass on a restored library separately from a failed restore', async () => {
    // The restore itself succeeded — the library is on screen. Only the
    // second pass over it failed, and the message should say so rather than
    // implicating the restore that worked fine.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Kept', rating: 90 })]);
    vi.mocked(countPendingDetails).mockReturnValue(1);
    vi.mocked(enrichDetails).mockRejectedValue(new Error('TMDB is unreachable'));

    render(<App />);
    await screen.findByText('Kept');

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to fetch details for the restored library',
        expect.any(Error),
      );
    });
    expect(consoleError).not.toHaveBeenCalledWith(
      'Failed to restore the saved library',
      expect.anything(),
    );

    consoleError.mockRestore();
  });
});

describe('App board', () => {
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

  it('does not offer undo after an action that changed nothing', async () => {
    // The guard in dispatch says an action that changed nothing must not
    // become an undo step, and it compares by reference — which only means
    // anything if the reducer actually hands back the board it was given.
    // "Send everything back to the pool" on a board with nothing placed is the
    // cheapest way to press an action that changes nothing: the button is
    // always offered, so it is easy to do by accident, and before this it
    // pushed an identical board and left Ctrl+Z looking broken.
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);
    render(<App />);

    const undoButton = await screen.findByRole('button', { name: 'Undo' });
    await userEvent.click(
      screen.getByRole('button', { name: /send everything back to the pool/i }),
    );
    expect(undoButton).toBeDisabled();
  });

  it('gives the library screen a level-one heading of its own', async () => {
    // The landing page has one and it is gone by the time this renders; the
    // wordmark in the shell is a span, not a heading. Without this the whole
    // application, once a library is loaded, is a document whose heading list
    // starts at level two — which is what axe reported.
    vi.mocked(loadLibrary).mockResolvedValue([film('a')]);
    render(<App />);

    await screen.findByRole('button', { name: /import a different export/i });
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/your library/i);
  });

  it('does not let a board edit throw away a slow filters restore', async () => {
    // The board's "an edit wins over a restore" guard used to be the same ref
    // the filters restore reads, so a first drag landing before a slow
    // IndexedDB read silently discarded the criteria the user had saved. The
    // two answer different questions and now have a ref each.
    const filtersDeferred = deferred<FilterCriteria | null>();
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat', rating: 10 })]);
    vi.mocked(loadFilters).mockReturnValue(filtersDeferred.promise);
    vi.mocked(loadFirstBoard).mockResolvedValue(
      moveFilm(createBoard('board-1', 'Mine'), 'a', { tierId: 'S', index: 0 }),
    );

    render(<App />);
    await screen.findByRole('button', { name: /import a different export/i });

    // A real board edit, before the filters have arrived.
    await userEvent.click(
      screen.getByRole('button', { name: /send everything back to the pool/i }),
    );

    filtersDeferred.resolve({ minRating: 90 });

    // The criteria still apply: rating 10 is below 90, so nothing matches.
    expect(await screen.findByText('Nothing matches these filters.')).toBeInTheDocument();
  });

  it("keeps a row's edit controls out of the way until they are asked for", async () => {
    // Five controls on every row is a hundred and eighty pixels of chrome
    // above a board that has to share a screen with its pool, and renaming a
    // row is not what anyone came here to do. The switch is one for the whole
    // board rather than one per row: turning it on is a mode, not six clicks.
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);
    render(<App />);

    const toggle = await screen.findByRole('button', { name: 'Edit rows' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Row S label')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove row S' })).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(screen.getByLabelText('Row S label')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove row S' })).toBeInTheDocument();
    // Every row at once, not just the first.
    expect(screen.getByLabelText('Row F label')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done editing rows' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Done editing rows' }));
    expect(screen.queryByLabelText('Row S label')).not.toBeInTheDocument();
  });

  it('undoes a whole rename in one step, not one character at a time', async () => {
    // HISTORY_LIMIT is 50 and a row label holds 24 characters, so recording a
    // history entry per keystroke lets two full renames evict an entire
    // ranking session. Consecutive edits to the same field are one edit as far
    // as undo is concerned — the way every text editor treats a run of typing.
    // Ctrl+Z is deliberately declined inside an input, so the Undo button is
    // the only route back and it must not need one click per character.
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);
    render(<App />);

    // Held by reference, not re-queried: the input's accessible name embeds
    // the label it is editing ("Row S label"), so it changes as you type and a
    // re-query would fail on the name rather than on the value under test.
    // Row controls live behind the board's "Edit rows" switch — the default
    // board is colour and posters and nothing else.
    await userEvent.click(await screen.findByRole('button', { name: 'Edit rows' }));
    const label = await screen.findByLabelText('Row S label');
    expect(label).toHaveValue('S');
    await userEvent.type(label, 'uper');
    expect(label).toHaveValue('Super');

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(label).toHaveValue('S');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('keeps a rename of a different row as its own undo step', async () => {
    // Coalescing is per field, not per action type: renaming two rows is two
    // edits, and undo returns them one at a time.
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);
    render(<App />);

    // Held by reference, not re-queried: each input's accessible name embeds
    // the label it is editing ("Row S label"), so it changes as you type.
    // Row controls live behind the board's "Edit rows" switch.
    await userEvent.click(await screen.findByRole('button', { name: 'Edit rows' }));
    const rowS = await screen.findByLabelText('Row S label');
    await userEvent.type(rowS, 'x');
    const rowA = screen.getByLabelText('Row A label');
    // Two characters, so one Undo click distinguishes "one entry per field"
    // from "one entry per keystroke" — with a single character both would
    // leave the same value behind.
    await userEvent.type(rowA, 'ce');
    expect(rowA).toHaveValue('Ace');

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(rowA).toHaveValue('A');
    expect(rowS).toHaveValue('Sx');
  });

  it('does not let a null-key edit be swallowed into the next rename of the same row', async () => {
    // coalesceKey returns null for an action that stands on its own (here,
    // "send everything back to the pool" — clearToPool). The dispatch guard
    // is supposed to clear lastEdit on that branch so a *later* rename of the
    // same row cannot mistake it for a continuation of the rename that came
    // before it. Reached via clearToPool rather than a real drag: dnd-kit's
    // sensors read getBoundingClientRect, which jsdom always reports as all
    // zeros, so no drag can be driven here (see the two tests this branch
    // already deleted for exactly that reason) — but clearToPool dispatches
    // with the same null coalesceKey as `move` and runs through the identical
    // guard in App's dispatch, so it exercises the code path this test is
    // about just as well.
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);
    vi.mocked(loadFirstBoard).mockResolvedValue(
      moveFilm(createBoard('board-1', 'Mine'), 'a', { tierId: 'S', index: 0 }),
    );
    render(<App />);

    const row = await screen.findByRole('list', { name: /^S — 1 film$/ });
    expect(row).toHaveTextContent('Heat');

    // First edit to row S: its own undo entry. Row controls live behind the
    // board's "Edit rows" switch.
    await userEvent.click(await screen.findByRole('button', { name: 'Edit rows' }));
    const rowS = await screen.findByLabelText('Row S label');
    await userEvent.type(rowS, 'uper');
    expect(rowS).toHaveValue('Super');

    // A null-key action that actually changes the board, in between the two
    // renames. It only clears the row it names back to the pool if something
    // is placed there, which is why the board above was restored with "Heat"
    // already in S — clearToPool on an empty board is a no-op and wouldn't
    // exercise the branch under test at all.
    await userEvent.click(
      screen.getByRole('button', { name: /send everything back to the pool/i }),
    );
    expect(screen.getByRole('region', { name: 'Pool' })).toHaveTextContent('Heat');

    // Second edit to row S: must be its own undo entry too, not folded into
    // the first rename just because they share a coalesce key.
    await userEvent.type(rowS, 'duper');
    expect(rowS).toHaveValue('Superduper');

    // One Undo must return only the second rename — leaving both the first
    // rename and the clearToPool in place. If lastEdit were not cleared by
    // the null-key action, this Undo would instead squash the second rename
    // into the clearToPool entry, silently discarding it as an undo step and
    // restoring "Heat" to row S a click early.
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(rowS).toHaveValue('Super');
    expect(screen.getByRole('region', { name: 'Pool' })).toHaveTextContent('Heat');
  });

  it('asks before starting over, and names the board', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);
    render(<App />);

    await userEvent.click(
      await screen.findByRole('button', { name: /import a different export/i }),
    );
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
    // 'c' is filtered out (rating 20 < 50) but never placed — the film that
    // distinguishes poolFor(board, visible) from poolFor(board, films): both
    // give the same pool count if the only excluded film is also the placed
    // one, which is exactly the coincidence a prior review caught in this
    // fixture's earlier, two-film form.
    vi.mocked(loadLibrary).mockResolvedValue([
      film('a', { title: 'Kept', rating: 90 }),
      film('b', { title: 'Cut', rating: 10 }),
      film('c', { title: 'AlsoCut', rating: 20 }),
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

  it('does not autosave the fresh default board while a slower restore is still pending', async () => {
    // Regression: the debounced save fires 400ms after mount regardless of
    // whether loadFirstBoard() has resolved yet. Without a guard, that save
    // would write the empty default board over whatever was actually saved
    // last time — a tab closed in that window loses it for good, and the app
    // would write a board record even for someone who never opened one.
    const boardDeferred = deferred<TierBoard | null>();
    vi.mocked(loadFirstBoard).mockReturnValue(boardDeferred.promise);
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Heat' })]);

    render(<App />);
    await screen.findByText('Heat');

    // Real time, not a flush: the debounced save is scheduled with a real
    // setTimeout, and the restore is still pending when it would fire.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(saveBoard).not.toHaveBeenCalled();

    // The slow restore now resolves with a real board.
    const restored = moveFilm(createBoard('board-1', 'Mine'), 'a', {
      tierId: 'S',
      index: 0,
    });
    boardDeferred.resolve(restored);

    await waitFor(() => {
      expect(saveBoard).toHaveBeenCalledWith(restored);
    });
  });
});
