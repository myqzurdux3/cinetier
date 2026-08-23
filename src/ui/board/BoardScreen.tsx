import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Film } from '@/domain/film';
import type { TierBoard } from '@/domain/tiers';
import type { BoardAction } from '@/domain/board';
import { BoardCardFace } from './BoardCard';
import { TierRow } from './TierRow';
import { TierRowControls } from './TierRowControls';
import { Pool } from './Pool';
import { destinationFor, type DropTarget } from './dropTarget';
import { boardAnnouncements, type ItemDescription } from './announcements';

interface BoardScreenProps {
  board: TierBoard;
  /** The whole library, for resolving placed ids to films. */
  films: Film[];
  /** What the pool should show: already narrowed by the rail and the search. */
  poolFilms: Film[];
  search: string;
  onSearchChange: (next: string) => void;
  dispatch: (action: BoardAction) => void;
}

export function BoardScreen({
  board,
  films,
  poolFilms,
  search,
  onSearchChange,
  dispatch,
}: BoardScreenProps) {
  const byId = useMemo(() => new Map(films.map((film) => [film.id, film])), [films]);

  // The film currently being dragged, for the overlay below. Cleared on end
  // and on cancel so the state never claims a drag that is over — note that no
  // test can observe those two clears, because dnd-kit gates the overlay's
  // children on its own `active` as well, and that is already null by then.
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeFilm = activeId === null ? null : (byId.get(activeId) ?? null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Without a small distance, every click on a poster starts a drag and
      // the card never receives a plain click.
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const describe = (id: string): ItemDescription | null => {
    if (id === 'pool') return { title: 'Pool', where: 'the pool' };

    const tierId = id.startsWith('tier:') ? id.slice('tier:'.length) : null;
    if (tierId !== null) {
      const tier = board.tiers.find((candidate) => candidate.id === tierId);
      return tier ? { title: tier.label, where: `tier ${tier.label}` } : null;
    }

    const film = byId.get(id);
    if (!film) return null;
    for (const tier of board.tiers) {
      const ids = board.placements[tier.id] ?? [];
      const index = ids.indexOf(id);
      if (index !== -1) {
        return {
          title: film.title,
          where: `tier ${tier.label}, position ${String(index + 1)} of ${String(ids.length)}`,
        };
      }
    }
    return { title: film.title, where: 'the pool' };
  };

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const target = event.over?.data.current as DropTarget | undefined;
    if (!target) return;
    const destination = destinationFor(target, board, String(event.active.id));
    // null means "changed nothing": dispatching anyway would push an identical
    // board onto the undo history and make the next undo look broken.
    if (!destination) return;
    dispatch({ type: 'move', filmId: String(event.active.id), to: destination });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event: DragStartEvent) => {
        setActiveId(String(event.active.id));
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
      }}
      accessibility={{ announcements: boardAnnouncements(describe) }}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {board.tiers.map((tier, index) => (
            <TierRow
              key={tier.id}
              tier={tier}
              films={(board.placements[tier.id] ?? [])
                .map((id) => byId.get(id))
                .filter((film): film is Film => film !== undefined)}
            >
              <TierRowControls
                tier={tier}
                index={index}
                tierCount={board.tiers.length}
                dispatch={dispatch}
              />
            </TierRow>
          ))}
        </div>

        <Pool films={poolFilms} search={search} onSearchChange={onSearchChange} />
      </div>

      {/* The pool is virtualised: a card dragged out of it can be unmounted
          mid-drag, either by the auto-scroll dnd-kit runs on the pool's own
          scroll container or by the row it is travelling towards changing the
          pool's contents. Without an overlay the dragged element *is* that
          virtualised node, so the drag would lose the thing it is dragging.
          The overlay is a copy dnd-kit owns and positions itself, which
          outlives the source element by construction. */}
      <DragOverlay>
        {activeFilm && (
          <div className="w-full">
            <BoardCardFace film={activeFilm} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
