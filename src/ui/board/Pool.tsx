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
      className={`space-y-2 rounded-card border p-2 ${isOver ? 'border-accent' : 'border-line'}`}
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
        <FilmGrid films={films} renderCard={(film) => <BoardCard film={film} tierId={null} />} />
      )}
    </section>
  );
}
