import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Film } from '@/domain/film';

interface BoardCardProps {
  film: Film;
  /** The row this card sits in, or null while it is in the pool. */
  tierId: string | null;
}

/**
 * What a card looks like, with nothing about dragging in it.
 *
 * A fragment rather than an element, so `BoardCard` below renders exactly the
 * DOM it always has. It exists so the drag overlay can draw the same card
 * without calling `useSortable` a second time for an id that is already
 * registered — and so the two can never drift apart, since there is only one
 * description of a card's appearance.
 */
export function BoardCardFace({ film }: { film: Film }) {
  return (
    <>
      {/* The title appears exactly once, so a card's text content is the
          film's name and nothing else. With a poster it is visually hidden
          and the image is decorative; without one it *is* the card. */}
      {film.posterPath && (
        <img
          src={`https://image.tmdb.org/t/p/w154${film.posterPath}`}
          alt=""
          className="aspect-[2/3] w-full rounded-card object-cover"
        />
      )}
      <span
        className={
          film.posterPath
            ? 'sr-only'
            : 'flex aspect-[2/3] w-full items-center justify-center rounded-card border border-line p-1 text-center text-[10px] leading-tight text-ink-dim'
        }
      >
        {film.title}
      </span>
    </>
  );
}

/**
 * One poster, draggable by pointer and by keyboard.
 *
 * `data` is what Task 5's translation reads back on drop: dnd-kit hands the
 * whole object to `onDragEnd`, so the card is where a drop target describes
 * itself rather than somewhere a lookup has to reconstruct it.
 */
export function BoardCard({ film, tierId }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: film.id,
    data: { type: 'card', tierId, filmId: film.id },
  });

  // A plain div, not an <li>: this card renders both inside a row's list and
  // inside the pool's grid, and an <li> in the grid would be a list item with
  // no list. TierRow supplies the <li> around it.
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${isDragging ? 'opacity-40' : ''} w-full`}
      {...attributes}
      {...listeners}
    >
      <BoardCardFace film={film} />
    </div>
  );
}
