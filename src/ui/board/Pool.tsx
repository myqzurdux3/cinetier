import { useId, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Film } from '@/domain/film';
import { FilmGrid } from '@/ui/library/FilmGrid';
import { BoardCard } from './BoardCard';
import { POOL_ID } from './collision';

interface PoolProps {
  /** Already narrowed by the rail and by `search`; the pool renders what it is given. */
  films: Film[];
  search: string;
  onSearchChange: (next: string) => void;
  /**
   * Shown in place of the grid when the rail admits nothing at all. It lives
   * here because the rail narrows the pool and nothing else — the rows keep
   * their films whatever the criteria say — so an over-tight filter should
   * empty this one region, not take the board off the screen with it. Pool
   * knows nothing about filters; it renders what it is handed.
   */
  notice?: ReactNode;
}

export function Pool({ films, search, onSearchChange, notice }: PoolProps) {
  const searchId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: POOL_ID, data: { type: 'pool' } });
  // One height, used by the grid and by the message that stands in for it —
  // an empty pool is exactly when something is dropped into it, and as a bare
  // line of prose it was a strip too thin to aim at. A quarter of the screen
  // under the board; nearly all of it in the column the pool gets at `xl`.
  const gridHeight = 'h-[26dvh] min-h-40 xl:h-[calc(100dvh-11rem)]';

  return (
    <section
      ref={setNodeRef}
      aria-label="Pool"
      className={`shrink-0 space-y-2 rounded-card border p-2 ${isOver ? 'border-accent' : 'border-line'}`}
    >
      {/*
        Count above, search below, each on its own full-width line. Side by
        side they fit the full-width pool and break badly in the narrow column
        the pool gets on a wide screen — "Search the pool" wrapping onto two
        lines beside a one-line count.
      */}
      <div className="space-y-2">
        <p className="text-sm text-ink-dim">
          {films.length === 1 ? '1 film to place' : `${String(films.length)} films to place`}
        </p>
        <label htmlFor={searchId} className="sr-only">
          Search the pool
        </label>
        <input
          id={searchId}
          type="search"
          value={search}
          placeholder="Search the pool"
          onChange={(event) => {
            onSearchChange(event.target.value);
          }}
          className="w-full rounded-card border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-dim focus:ring-2 focus:ring-accent"
        />
      </div>

      {notice ?? null}

      {notice ? null : films.length === 0 ? (
        // The same height as the grid it stands in for. An empty pool is
        // exactly when this text asks to be dropped into, and as a bare line
        // of prose it was a sixty-pixel strip at the bottom of the screen —
        // aiming a card at it missed by two pixels and the film landed in the
        // tier row behind instead.
        <p
          className={`flex ${gridHeight} items-center justify-center p-4 text-center text-sm text-ink-dim`}
        >
          {search === ''
            ? 'Every film is placed. Drag one back here to unrank it.'
            : 'No film in the pool matches that search.'}
        </p>
      ) : (
        <FilmGrid
          films={films}
          renderCard={(film) => <BoardCard film={film} tierId={null} />}
          // The pool shares one screen with the tier rows, so it takes a
          // fraction of the viewport rather than the 78vh the library grid
          // takes when it owns the screen. A pool that pushes every row off
          // the top is a pool nothing can be dragged out of.
          heightClass={gridHeight}
          // Roughly the width of a card inside a row (w-16/w-20), so a film is
          // the same size on both sides of the drag.
          columnWidth={84}
        />
      )}
    </section>
  );
}
