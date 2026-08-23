import { useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Film } from '@/domain/film';
import type { TierBoard } from '@/domain/tiers';
import type { BoardAction } from '@/domain/board';
import { TierRow } from './TierRow';
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
      onDragEnd={onDragEnd}
      accessibility={{ announcements: boardAnnouncements(describe) }}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {board.tiers.map((tier) => (
            <TierRow
              key={tier.id}
              tier={tier}
              films={(board.placements[tier.id] ?? [])
                .map((id) => byId.get(id))
                .filter((film): film is Film => film !== undefined)}
            />
          ))}
        </div>

        <Pool films={poolFilms} search={search} onSearchChange={onSearchChange} />
      </div>
    </DndContext>
  );
}
