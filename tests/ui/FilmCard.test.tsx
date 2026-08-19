import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilmCard } from '@/ui/library/FilmCard';
import type { Film } from '@/domain/film';

function film(overrides: Partial<Film> = {}): Film {
  return {
    id: 'x',
    imdbId: null,
    tmdbId: null,
    title: 'The Matrix',
    year: 1999,
    titleType: 'movie',
    rating: 90,
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
    ...overrides,
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
