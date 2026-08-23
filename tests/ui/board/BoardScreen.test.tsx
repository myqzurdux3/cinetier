import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    const s = screen.getByRole('list', { name: 'S — 1 film' });
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

  it('wires its announcements into a real drag: lifting a card names the film and its row', () => {
    // A keyboard lift needs no layout: dnd-kit's Accessibility component
    // calls announcements.onDragStart on Space alone, before any geometry is
    // consulted, and this is the only test in the suite that starts a real
    // drag inside DndContext — as opposed to `announcements.test.ts`, which
    // exercises boardAnnouncements against a hand-written stub that never
    // touches BoardScreen's own `describe`.
    //
    // The text actually landing in the live region is the onDragOver
    // announcement, not onDragStart's: dnd-kit runs its initial collision
    // detection in the same React commit as the lift (see the `overId`
    // effect in @dnd-kit/core), so onDragOver's announcement overwrites
    // onDragStart's before this assertion can observe it. With only one
    // film in tier S, the card's own nested sortable droppable is the
    // closest (indeed only meaningful) collision under jsdom's all-zero
    // rects, so `over` resolves to the film itself rather than the row or
    // the pool. That still exercises `describe`'s film-id branch, the
    // 1-based position math, and the row length — and it still requires the
    // `accessibility` prop below to be wired, which is the point.
    renderScreen();
    const card = screen
      .getByText('Heat')
      .closest('[role="button"], [aria-roledescription]') as HTMLElement;
    card.focus();
    fireEvent.keyDown(card, { code: 'Space' });
    const region = document.querySelector('[id^="DndLiveRegion"]');
    expect(region).toHaveTextContent('Heat is over tier S, position 1 of 1.');
  });
});
