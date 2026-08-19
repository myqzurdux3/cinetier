import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilmGrid } from '@/ui/library/FilmGrid';
import type { Film } from '@/domain/film';

function film(id: string): Film {
  return {
    id,
    imdbId: null,
    tmdbId: null,
    title: `Film ${id}`,
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
    source: 'imdb',
  };
}

// jsdom reports every element's size as 0, so @tanstack/react-virtual's
// viewport measurement (offsetHeight/offsetWidth) sees an empty scroll
// container and renders no rows at all. Stubbing a plausible viewport size
// is the standard way to exercise virtualized lists under jsdom; it is not
// an assertion about virtualization itself (that cannot be meaningfully
// tested here), just enough for the smoke test below to see real rows.
// The stubbed height (800px) is deliberately larger than a single row
// (232px) so that, with 8 films at columns={3} (3 rows), more than one
// row falls inside the virtual window and the per-row slice arithmetic in
// FilmGrid is actually exercised, not just row index 0.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 });
});

describe('FilmGrid', () => {
  it('renders every film it is given, across multiple rows', () => {
    const films = [
      film('a'),
      film('b'),
      film('c'),
      film('d'),
      film('e'),
      film('f'),
      film('g'),
      film('h'),
    ];
    render(<FilmGrid films={films} columns={3} />);

    for (const f of films) {
      expect(screen.getByText(f.title)).toBeInTheDocument();
    }
  });
});
