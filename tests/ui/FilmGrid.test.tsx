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
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 });
});

describe('FilmGrid', () => {
  it('renders cards for the films it is given', () => {
    const films = [film('a'), film('b'), film('c'), film('d'), film('e')];
    render(<FilmGrid films={films} />);

    const rendered = films.filter((f) => screen.queryByText(f.title) !== null);
    expect(rendered.length).toBeGreaterThan(0);
    for (const f of rendered) {
      expect(films.some((original) => original.id === f.id)).toBe(true);
    }
  });
});
