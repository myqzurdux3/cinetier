import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Film } from '@/domain/film';
import { FilmCard } from './FilmCard';

interface FilmGridProps {
  films: Film[];
  columns?: number;
}

const ROW_HEIGHT = 232;

export function FilmGrid({ films, columns = 6 }: FilmGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(films.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  return (
    <div ref={scrollRef} className="h-[70vh] overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className="absolute left-0 grid w-full gap-3"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              transform: `translateY(${row.start}px)`,
            }}
          >
            {films.slice(row.index * columns, row.index * columns + columns).map((film) => (
              <FilmCard key={film.id} film={film} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
