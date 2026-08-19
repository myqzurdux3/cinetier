import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LibraryHeader } from '@/ui/library/LibraryHeader';
import type { Film } from '@/domain/film';

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
    source: 'imdb',
  };
}

describe('LibraryHeader', () => {
  it('presents the library as a titled section rather than a stray sentence', () => {
    render(
      <LibraryHeader
        films={[film('a')]}
        warnings={[]}
        skipped={0}
        enriching={null}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: /your library/i })).toBeInTheDocument();
    expect(screen.getByText(/1 film/)).toBeInTheDocument();
  });
});
