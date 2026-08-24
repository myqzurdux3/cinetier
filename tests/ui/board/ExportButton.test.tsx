import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExportButton } from '@/ui/board/ExportButton';
import { createBoard, moveFilm } from '@/domain/tiers';
import type { Film } from '@/domain/film';

const film: Film = {
  id: 'a',
  imdbId: null,
  tmdbId: null,
  title: 'Heat',
  year: 1995,
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
  detailsFetched: false,
  source: 'imdb',
};

// The rendering itself needs a 2D canvas context, which jsdom does not have,
// so what is worth asserting here is when the button offers itself at all.
describe('ExportButton', () => {
  it('is unavailable while nothing is placed', () => {
    render(<ExportButton board={createBoard('b', 'x')} films={[film]} />);
    expect(screen.getByRole('button', { name: 'Save as PNG' })).toBeDisabled();
  });

  it('becomes available once a film is in a row', () => {
    const board = moveFilm(createBoard('b', 'x'), 'a', { tierId: 'S', index: 0 });
    render(<ExportButton board={board} films={[film]} />);
    expect(screen.getByRole('button', { name: 'Save as PNG' })).toBeEnabled();
  });

  it('says nothing until something has gone wrong', () => {
    const board = moveFilm(createBoard('b', 'x'), 'a', { tierId: 'S', index: 0 });
    const { container } = render(<ExportButton board={board} films={[film]} />);
    // The live region is mounted from the start — a region that appears only
    // when there is something to say is frequently not announced — and empty.
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent('');
  });
});
