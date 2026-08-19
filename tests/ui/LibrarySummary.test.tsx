import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibrarySummary } from '@/ui/library/LibrarySummary';
import type { Film } from '@/domain/film';

function film(id: string, rating: number | null): Film {
  return {
    id,
    imdbId: null,
    tmdbId: null,
    title: id,
    year: 2000,
    titleType: 'movie',
    rating,
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

const films = [film('a', 90), film('b', null)];

describe('LibrarySummary', () => {
  it('counts the library and how much of it is rated', () => {
    render(
      <LibrarySummary films={films} skipped={0} warnings={[]} enriching={null} onReset={vi.fn()} />,
    );
    expect(screen.getByText(/2 films/)).toBeInTheDocument();
    expect(screen.getByText(/1 rated/)).toBeInTheDocument();
  });

  it('shows enrichment progress while it is running, and not after', () => {
    const { rerender } = render(
      <LibrarySummary
        films={films}
        skipped={0}
        warnings={[]}
        enriching={{ done: 1, total: 2 }}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByText(/finding posters/i)).toBeInTheDocument();

    rerender(
      <LibrarySummary films={films} skipped={0} warnings={[]} enriching={null} onReset={vi.fn()} />,
    );
    expect(screen.queryByText(/finding posters/i)).not.toBeInTheDocument();
  });

  it('surfaces import warnings rather than hiding them', () => {
    render(
      <LibrarySummary
        films={films}
        skipped={0}
        warnings={['Skipped a row: "Broken".']}
        enriching={null}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByText(/Skipped a row/)).toBeInTheDocument();
  });

  it('lists two identical warnings as two rows', () => {
    // Two untitled rows produce byte-identical warnings, so keying the list by
    // message text gives React duplicate keys for genuinely distinct rows.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const repeated = 'Skipped a row with no title.';

    render(
      <LibrarySummary
        films={films}
        skipped={0}
        warnings={[repeated, repeated]}
        enriching={null}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getAllByText(repeated)).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('offers a way to start over', async () => {
    const onReset = vi.fn();
    render(
      <LibrarySummary films={films} skipped={0} warnings={[]} enriching={null} onReset={onReset} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /import a different/i }));
    expect(onReset).toHaveBeenCalled();
  });
});

describe('LibrarySummary on a mixed library', () => {
  function typed(id: string, titleType: Film['titleType']): Film {
    return { ...film(id, 80), titleType };
  }

  it('breaks the count down by kind once the library is not only films', () => {
    render(
      <LibrarySummary
        films={[typed('a', 'movie'), typed('b', 'series'), typed('c', 'series')]}
        warnings={[]}
        skipped={0}
        enriching={null}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByText(/3 titles/)).toBeInTheDocument();
    expect(screen.getByText(/2 series/)).toBeInTheDocument();
    expect(screen.getByText(/1 film/)).toBeInTheDocument();
  });

  it('says "films" and gives no breakdown when the library holds only films', () => {
    render(
      <LibrarySummary
        films={[typed('a', 'movie'), typed('b', 'movie')]}
        warnings={[]}
        skipped={0}
        enriching={null}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 films/)).toBeInTheDocument();
    expect(screen.queryByText(/titles/)).not.toBeInTheDocument();
  });

  it('never pluralizes "series" into "seriess"', () => {
    render(
      <LibrarySummary
        films={[typed('a', 'movie'), typed('b', 'series'), typed('c', 'miniSeries')]}
        warnings={[]}
        skipped={0}
        enriching={null}
        onReset={vi.fn()}
      />,
    );
    expect(screen.queryByText(/seriess/)).not.toBeInTheDocument();
  });

  it('reports entries that were skipped outright', () => {
    render(
      <LibrarySummary films={films} warnings={[]} skipped={3} enriching={null} onReset={vi.fn()} />,
    );
    expect(screen.getByText(/3 skipped/)).toBeInTheDocument();
  });

  it('says nothing about skipped entries when none were', () => {
    render(
      <LibrarySummary films={films} skipped={0} warnings={[]} enriching={null} onReset={vi.fn()} />,
    );
    expect(screen.queryByText(/skipped/)).not.toBeInTheDocument();
  });
});
