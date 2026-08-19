import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
// (214px) so that, with 8 films at columns={3} (3 rows), more than one
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

  it('plays the entrance once per import, not on every render', async () => {
    // The grid is virtualized: rows scrolled into view later must not animate,
    // or a long library flickers for as long as the reader keeps scrolling.
    const films = Array.from({ length: 12 }, (_, i) => film(`f${i}`));
    const { container, rerender } = render(<FilmGrid films={films} generation={1} />);
    expect(container.querySelectorAll('[data-entering="true"]').length).toBeGreaterThan(0);

    // The entrance clears itself inside a requestAnimationFrame callback, which
    // under jsdom is a real (async) timer rather than something React's act()
    // flushes synchronously. Asserting "no replay on a plain rerender"
    // immediately after the initial render would race that callback: on a slow
    // run the flag could still read true, making the assertion below flaky
    // rather than reliably true or false. Waiting for it to actually clear
    // first removes that race.
    await waitFor(() => {
      expect(container.querySelectorAll('[data-entering="true"]').length).toBe(0);
    });

    rerender(<FilmGrid films={films} generation={1} />);
    expect(container.querySelectorAll('[data-entering="true"]').length).toBe(0);

    rerender(<FilmGrid films={films} generation={2} />);
    expect(container.querySelectorAll('[data-entering="true"]').length).toBeGreaterThan(0);
  });

  it('gates every entrance-state class behind motion-safe, not just the transition itself', () => {
    // Under prefers-reduced-motion the entrance must not run at all, not just
    // run without easing. That only holds if every class that moves or hides
    // a card while it is entering — not merely the transition/duration
    // classes — is itself conditioned on motion-safe. jsdom does not evaluate
    // media queries, so this asserts on the class names directly: any class
    // targeting data-[entering=true] must carry the motion-safe: prefix, or
    // reduced-motion readers get an unanimated flash instead of no entrance.
    const films = [film('a')];
    const { container } = render(<FilmGrid films={films} generation={1} />);
    const entering = container.querySelector('[data-entering="true"]');
    expect(entering).not.toBeNull();

    const classes = entering!.className.split(/\s+/).filter(Boolean);
    const stateClasses = classes.filter((c) => c.includes('data-[entering=true]'));
    expect(stateClasses.length).toBeGreaterThan(0);
    for (const className of stateClasses) {
      expect(className.startsWith('motion-safe:')).toBe(true);
    }
  });

  it('does not animate rows that enter the virtual window later via scroll', async () => {
    // The entrance flag is shared by the whole grid, not owned per row: a row
    // that mounts later, once the reader has scrolled past the initial
    // viewport, must see it already cleared. Otherwise a long library
    // flickers for as long as the reader keeps scrolling.
    const films = Array.from({ length: 400 }, (_, i) => film(`f${i}`));
    const { container } = render(<FilmGrid films={films} columns={8} generation={1} />);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-entering="true"]').length).toBe(0);
    });

    const scroller = container.querySelector('.overflow-y-auto');
    expect(scroller).not.toBeNull();
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 20000,
    });
    fireEvent.scroll(scroller!);

    expect(container.querySelectorAll('[data-entering="false"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-entering="true"]').length).toBe(0);
  });
});
