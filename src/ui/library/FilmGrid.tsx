import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Film } from '@/domain/film';
import { FilmCard } from './FilmCard';

interface FilmGridProps {
  films: Film[];
  /**
   * Explicit override. Omit it to let the grid follow the container's
   * measured width instead — that's what a real screen gets.
   */
  columns?: number;
  /** Changes once per import. Playing the entrance again is what it means. */
  generation?: number;
}

const ROW_HEIGHT = 214;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 8;
const COLUMN_WIDTH = 150;

/**
 * Turns a measured container width into a column count: roughly one column
 * per 150px, floored at 2 (a phone still gets a grid, not a single-file
 * list) and capped at 8 (today's fixed desktop count, so nothing gets denser
 * than what already shipped).
 */
export function deriveColumnCount(width: number): number {
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.floor(width / COLUMN_WIDTH)));
}

export function FilmGrid({ films, columns, generation = 0 }: FilmGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [measuredColumns, setMeasuredColumns] = useState(MAX_COLUMNS);
  const effectiveColumns = columns ?? measuredColumns;
  const rowCount = Math.ceil(films.length / effectiveColumns);
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    setEntering(true);
    // One frame is enough to let the initial state paint; anything longer and
    // the reader sees the cards sitting in their pre-animation position.
    const id = requestAnimationFrame(() => setEntering(false));
    return () => cancelAnimationFrame(id);
  }, [generation]);

  useEffect(() => {
    // An explicit columns prop is an override, not a starting point: skip
    // measuring altogether so it means what it says.
    if (columns !== undefined) return;
    const el = scrollRef.current;
    // jsdom (the test environment) does not implement ResizeObserver. Falling
    // back to the fixed default rather than throwing keeps every test that
    // never touches this file working, and keeps a browser without the API
    // (there isn't a shipping one, but this is cheap insurance) from crashing.
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setMeasuredColumns(deriveColumnCount(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [columns]);

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
              gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))`,
              transform: `translateY(${row.start}px)`,
            }}
          >
            {films
              .slice(row.index * effectiveColumns, row.index * effectiveColumns + effectiveColumns)
              .map((film, index) => (
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
