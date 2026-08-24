import { useId } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Film } from '@/domain/film';
import { FilmGrid } from '@/ui/library/FilmGrid';
import { BoardCard } from './BoardCard';

interface PoolProps {
  /** Already narrowed by the rail and by `search`; the pool renders what it is given. */
  films: Film[];
  search: string;
  onSearchChange: (next: string) => void;
}

export function Pool({ films, search, onSearchChange }: PoolProps) {
  const searchId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', data: { type: 'pool' } });

  return (
    <section
      ref={setNodeRef}
      aria-label="Pool"
      className={`shrink-0 space-y-2 rounded-card border p-2 ${isOver ? 'border-accent' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-dim">
          {films.length === 1 ? '1 film to place' : `${String(films.length)} films to place`}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor={searchId} className="text-sm text-ink-dim">
            Search the pool
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => {
              onSearchChange(event.target.value);
            }}
            className="rounded-card border border-line bg-surface px-2 py-1 text-sm text-ink focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {films.length === 0 ? (
        <p className="p-4 text-center text-sm text-ink-dim">
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
          heightClass="h-[24dvh] min-h-32"
          // Roughly the width of a card inside a row (w-16/w-20), so a film is
          // the same size on both sides of the drag.
          columnWidth={84}
        />
      )}
    </section>
  );
}
