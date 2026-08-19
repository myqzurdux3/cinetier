import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Film } from '@/domain/film';
import { FilmCard } from './FilmCard';

interface FilmGridProps {
  films: Film[];
  columns?: number;
  /** Changes once per import. Playing the entrance again is what it means. */
  generation?: number;
}

const ROW_HEIGHT = 214;

export function FilmGrid({ films, columns = 8, generation = 0 }: FilmGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(films.length / columns);
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    setEntering(true);
    // One frame is enough to let the initial state paint; anything longer and
    // the reader sees the cards sitting in their pre-animation position.
    const id = requestAnimationFrame(() => setEntering(false));
    return () => cancelAnimationFrame(id);
  }, [generation]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  return (
    <div ref={scrollRef} className="h-[78vh] overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className="absolute left-0 grid w-full gap-2"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              transform: `translateY(${row.start}px)`,
            }}
          >
            {films.slice(row.index * columns, row.index * columns + columns).map((film, index) => (
              <div
                key={film.id}
                data-entering={entering ? 'true' : 'false'}
                className="motion-safe:transition-all motion-safe:duration-500 motion-safe:data-[entering=true]:translate-y-2 motion-safe:data-[entering=true]:opacity-0"
                style={{ transitionDelay: `${Math.min(index * 25, 200)}ms` }}
              >
                <FilmCard film={film} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
