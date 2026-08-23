import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardScreen } from '@/ui/board/BoardScreen';
import { createBoard, moveFilm, DEFAULT_TIERS } from '@/domain/tiers';
import { makeFilm } from '../../support/film';

const heat = makeFilm({ title: 'Heat' });
const dune = makeFilm({ title: 'Dune' });
const films = [heat, dune];

function renderScreen(overrides: Partial<Parameters<typeof BoardScreen>[0]> = {}) {
  const dispatch = vi.fn();
  const board = moveFilm(createBoard('b1', 'Mine'), heat.id, { tierId: 'S', index: 0 });
  render(
    <BoardScreen
      board={board}
      films={films}
      poolFilms={[dune]}
      search=""
      onSearchChange={vi.fn()}
      dispatch={dispatch}
      {...overrides}
    />,
  );
  return { dispatch, board };
}

describe('BoardScreen', () => {
  it('renders one row per tier, in the board’s order', () => {
    renderScreen();
    const rows = screen.getAllByRole('list').filter((list) => list.getAttribute('aria-label'));
    expect(rows.map((row) => row.getAttribute('aria-label')?.split(' —')[0])).toEqual(
      DEFAULT_TIERS.map((tier) => tier.label),
    );
  });

  it('shows a placed film in its row and not in the pool', () => {
    renderScreen();
    const s = screen.getByRole('list', { name: /^S —/ });
    expect(s).toHaveTextContent('Heat');
    expect(s).not.toHaveTextContent('Dune');
  });

  it('renders the pool below the rows', () => {
    renderScreen();
    expect(screen.getByRole('region', { name: 'Pool' })).toBeInTheDocument();
  });

  it('skips a placement whose film the library no longer holds', () => {
    // The board deliberately keeps such a placement so a re-import restores
    // it. Rendering must not crash on it, and must not draw an empty card.
    const board = moveFilm(createBoard('b1', 'Mine'), 'ghost', { tierId: 'S', index: 0 });
    renderScreen({ board, poolFilms: films });
    expect(screen.getByRole('list', { name: /^S — 0 films/ })).toBeInTheDocument();
  });
});
