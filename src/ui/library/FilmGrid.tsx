import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  /**
   * What to draw in a cell. Defaults to the library's own card; the board's
   * pool passes a draggable one. The grid owns layout and virtualisation and
   * has no opinion about the cell.
   */
  renderCard?: (film: Film) => ReactNode;
  /**
   * How tall the scroll container is, as a Tailwind height class. The library
   * grid owns the screen and takes most of it; the board's pool shares the
   * screen with the tier rows and takes far less, because a pool you cannot
   * see at the same time as a row is a pool you cannot drag out of.
   */
  heightClass?: string;
  /**
   * Roughly how wide one column should be, which is what decides how many
   * there are. The library shows posters worth looking at; the pool shows
   * thumbnails to drag, and matching the rows' card width keeps a film the
   * same size on both sides of the drag.
   */
  columnWidth?: number;
}

const MIN_COLUMNS = 2;
// 8 was the library grid's fixed desktop count, and stays its ceiling. The
// pool asks for narrower columns and so needs a higher one: capping it at 8
// would leave two thirds of a desktop row empty.
const MAX_COLUMNS = 8;
const MAX_COLUMNS_DENSE = 16;
const COLUMN_WIDTH = 150;
// Sensible value for the first render, before any ResizeObserver
// measurement has arrived, and for the jsdom test path where
// ResizeObserver does not exist at all: wide enough that deriveColumnCount
// lands on MAX_COLUMNS, matching the desktop-shaped default this replaces.
const DEFAULT_WIDTH = MAX_COLUMNS * COLUMN_WIDTH;

// Tailwind's gap-2 (0.5rem) at the framework's default 16px root font size,
// which this app never overrides. The row's className is literally gap-2
// (src/ui/library/FilmGrid.tsx), so this is the same 8px the browser
// actually applies — not an independent guess.
const GAP_PX = 8;
// FilmCard's poster is aspect-[2/3] (src/ui/library/FilmCard.tsx): width to
// height is 2:3, so a card's height is always 1.5x its column width.
const CARD_ASPECT_RATIO = 3 / 2;

/**
 * Turns a measured container width into a column count: roughly one column
 * per 150px, floored at 2 (a phone still gets a grid, not a single-file
 * list) and capped at 8 (today's fixed desktop count, so nothing gets denser
 * than what already shipped).
 */
export function deriveColumnCount(width: number, columnWidth: number = COLUMN_WIDTH): number {
  const cap = columnWidth < COLUMN_WIDTH ? MAX_COLUMNS_DENSE : MAX_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.min(cap, Math.floor(width / columnWidth)));
}

/**
 * Turns a measured container width and the column count it produced into
 * the vertical distance between rows: the card height that column width
 * implies, plus the row gap.
 *
 * This used to be a constant (214), which only fit an ~143px column. Once
 * the column count started following the viewport instead of staying
 * pinned at 8, a narrow screen's wider columns produced taller cards than
 * the constant accounted for, and the virtualizer's absolutely positioned
 * rows overlapped — worst just below each column-count threshold, e.g. a
 * 449px container still gets 2 columns, 220px wide, 331px-tall cards,
 * against a 214px pitch. Deriving the pitch from the same width and column
 * count the layout actually uses keeps the two in sync by construction.
 */
export function deriveRowPitch(width: number, columns: number): number {
  const safeColumns = Math.max(columns, 1);
  const columnWidth = Math.max(width - GAP_PX * (safeColumns - 1), 0) / safeColumns;
  const cardHeight = columnWidth * CARD_ASPECT_RATIO;
  return cardHeight + GAP_PX;
}

export function FilmGrid({
  films,
  columns,
  renderCard,
  heightClass = 'h-[78vh]',
  columnWidth = COLUMN_WIDTH,
}: FilmGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(DEFAULT_WIDTH);
  const effectiveColumns = columns ?? deriveColumnCount(measuredWidth, columnWidth);
  const rowPitch = deriveRowPitch(measuredWidth, effectiveColumns);
  const rowCount = Math.ceil(films.length / effectiveColumns);
  const [entering, setEntering] = useState(true);

  // Once, on mount. A `generation` prop used to let a caller replay this; the
  // board replaced the library screen and nothing has passed it since, and a
  // new import remounts the grid anyway, so it only ever meant "on mount"
  // twice over.
  useEffect(() => {
    // One frame is enough to let the initial state paint; anything longer and
    // the reader sees the cards sitting in their pre-animation position.
    const id = requestAnimationFrame(() => setEntering(false));
    return () => cancelAnimationFrame(id);
  }, []);

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
      setMeasuredWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [columns]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowPitch,
    overscan: 3,
  });

  return (
    <div ref={scrollRef} className={`${heightClass} overflow-y-auto`}>
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
                  {renderCard ? renderCard(film) : <FilmCard film={film} />}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
