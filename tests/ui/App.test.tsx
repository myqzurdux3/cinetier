import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import App from '@/ui/App';
import { loadLibrary, saveLibrary, clearLibrary } from '@/services/library';
import { enrichLibrary, type EnrichProgress } from '@/enrich/enrichLibrary';
import type { Film } from '@/domain/film';

vi.mock('@/services/library', () => ({
  loadLibrary: vi.fn(),
  saveLibrary: vi.fn(),
  clearLibrary: vi.fn(),
}));

vi.mock('@/enrich/enrichLibrary', () => ({
  enrichLibrary: vi.fn(),
}));

const imdbCsv = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');

function film(id: string): Film {
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
