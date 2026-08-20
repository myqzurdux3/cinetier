import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import App from '@/ui/App';
import { loadLibrary, saveLibrary, clearLibrary } from '@/services/library';
import { enrichLibrary, type EnrichProgress } from '@/enrich/enrichLibrary';
import { loadFilters, saveFilters, clearFilters } from '@/services/filters';
import { enrichDetails, countPendingDetails } from '@/enrich/enrichDetails';
import type { Film } from '@/domain/film';

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
});

describe('App persistence', () => {
  it('restores the saved library on mount', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a'), film('b')]);

    render(<App />);

    await waitFor(() => expect(loadLibrary).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: /import a different export/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 films/)).toBeInTheDocument();
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

    const resetButton = await screen.findByRole('button', { name: /import a different export/i });
    await userEvent.click(resetButton);

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

    const resetButton = await screen.findByRole('button', { name: /import a different export/i });
    await userEvent.click(resetButton);
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
    const resetButton = await screen.findByRole('button', { name: /import a different export/i });
    await userEvent.click(resetButton);

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

    const resetButton = await screen.findByRole('button', { name: /import a different export/i });
    await userEvent.click(resetButton);
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

    const resetButton = await screen.findByRole('button', { name: /import a different export/i });
    await userEvent.click(resetButton);
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
    expect(screen.queryByText('Cut')).not.toBeInTheDocument();
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

  it('explains an empty result instead of showing an empty grid', async () => {
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Kept', rating: 10 })]);
    vi.mocked(loadFilters).mockResolvedValue({ minRating: 90 });

    render(<App />);

    expect(await screen.findByText('Nothing matches these filters.')).toBeInTheDocument();
  });

  it('does not show the empty-library explainer for a genuinely empty library', async () => {
    // Distinct from the case above: no criterion is active, so `visible` is
    // empty because the library itself is, not because a filter cut it. The
    // rail's "Nothing matches these filters" message would be the wrong
    // explanation, and its "Clear all filters" button would clear nothing.
    vi.mocked(loadLibrary).mockResolvedValue([]);
    vi.mocked(loadFilters).mockResolvedValue(null);

    render(<App />);

    await waitFor(() => expect(loadLibrary).toHaveBeenCalled());
    expect(screen.queryByText('Nothing matches these filters.')).not.toBeInTheDocument();
  });

  it('never shows two buttons named "Clear all filters" at once', async () => {
    // FilterStatus's own clear-all chip and NoResults's clear-all button are
    // both accessible-name "Clear all filters". If both mounted at once,
    // `getByRole('button', { name: 'Clear all filters' })` — used by "forgets
    // the criteria when the last one is cleared" above — would throw on an
    // ambiguous match.
    vi.mocked(loadLibrary).mockResolvedValue([film('a', { title: 'Kept', rating: 10 })]);
    vi.mocked(loadFilters).mockResolvedValue({ minRating: 90 });

    render(<App />);
    await screen.findByText('Nothing matches these filters.');

    expect(screen.getAllByRole('button', { name: 'Clear all filters' })).toHaveLength(1);
  });

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
});
