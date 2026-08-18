import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import App from '@/ui/App';
import { loadLibrary, saveLibrary, clearLibrary } from '@/services/library';
import { enrichLibrary } from '@/enrich/enrichLibrary';
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
