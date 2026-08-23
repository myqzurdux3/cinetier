import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { Pool } from '@/ui/board/Pool';
import { makeFilm } from '../../support/film';

// The pool renders its cards through FilmGrid, which is virtualized. jsdom
// reports every element's size as 0, so @tanstack/react-virtual sees a
// zero-height viewport and renders no rows at all — the same limitation
// tests/ui/FilmGrid.test.tsx stubs around. Without this, the last test below
// (which needs an actual "Heat" card in the DOM) cannot pass regardless of
// what Pool does.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 });
});

const films = [makeFilm({ title: 'Heat' }), makeFilm({ title: 'Dune' })];

function renderPool(props: Partial<Parameters<typeof Pool>[0]> = {}) {
  const onSearchChange = vi.fn();
  render(
    <DndContext>
      <Pool films={films} search="" onSearchChange={onSearchChange} {...props} />
    </DndContext>,
  );
  return { onSearchChange };
}

describe('Pool', () => {
  it('counts what it is holding', () => {
    renderPool();
    expect(screen.getByText('2 films to place')).toBeInTheDocument();
  });

  it('uses the singular for one film', () => {
    renderPool({ films: [films[0]!] });
    expect(screen.getByText('1 film to place')).toBeInTheDocument();
  });

  it('reports what was typed, without filtering anything itself', () => {
    // The pool is controlled: App owns the search text and hands down the
    // already-narrowed list. A Pool that filtered internally would disagree
    // with the count above the moment the rail also had something to say.
    const { onSearchChange } = renderPool();
    fireEvent.change(screen.getByLabelText('Search the pool'), { target: { value: 'hea' } });
    expect(onSearchChange).toHaveBeenCalledWith('hea');
  });

  it('explains an empty pool rather than showing a blank area', () => {
    renderPool({ films: [] });
    expect(screen.getByText(/every film is placed/i)).toBeInTheDocument();
  });

  it('explains an empty pool differently when a search is what emptied it', () => {
    renderPool({ films: [], search: 'zzz' });
    expect(screen.getByText(/no film in the pool matches/i)).toBeInTheDocument();
  });

  it('renders draggable cards, not the library’s plain ones', () => {
    // Dragging out of the pool is the board's central action. FilmGrid's own
    // FilmCard is not a draggable, so a pool that fell back to it would look
    // right and do nothing — the exact defect this test exists to catch.
    renderPool();
    const card = screen.getByText('Heat').closest('[role="button"], [aria-roledescription]');
    expect(card).not.toBeNull();
  });
});
