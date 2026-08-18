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
    render(<LibrarySummary films={films} warnings={[]} enriching={null} onReset={vi.fn()} />);
    expect(screen.getByText(/2 films/)).toBeInTheDocument();
    expect(screen.getByText(/1 rated/)).toBeInTheDocument();
  });

  it('shows enrichment progress while it is running, and not after', () => {
    const { rerender } = render(
      <LibrarySummary
        films={films}
        warnings={[]}
        enriching={{ done: 1, total: 2 }}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByText(/finding posters/i)).toBeInTheDocument();

    rerender(<LibrarySummary films={films} warnings={[]} enriching={null} onReset={vi.fn()} />);
    expect(screen.queryByText(/finding posters/i)).not.toBeInTheDocument();
  });

  it('surfaces import warnings rather than hiding them', () => {
    render(
      <LibrarySummary
        films={films}
        warnings={['Skipped a row: "Broken".']}
        enriching={null}
        onReset={vi.fn()}
      />,
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
