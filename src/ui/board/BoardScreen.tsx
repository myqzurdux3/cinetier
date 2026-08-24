import { useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
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
import { preferPointer, POOL_ID } from './collision';
import { mayAutoScroll } from './autoScroll';
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
  /** Whether each row shows its rename, recolour, reorder and remove controls. */
  editingRows: boolean;
  /** Passed straight through to the pool — see `PoolProps.notice`. */
  poolNotice?: ReactNode;
}

export function BoardScreen({
  board,
  films,
  poolFilms,
  search,
  onSearchChange,
  dispatch,
  poolNotice,
  editingRows,
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

  // See collision.ts: closestCenter alone drops a film into whichever row's
  // centre happens to be nearest, which is not the row under the cursor as
  // soon as two rows differ in height. Held stable across renders because
  // dnd-kit re-runs it on every pointer move.
  const collisionDetection = useMemo(() => preferPointer(pointerWithin, closestCenter), []);

  const describe = (id: string): ItemDescription | null => {
    if (id === POOL_ID) return { title: 'Pool', where: 'the pool' };

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
      collisionDetection={collisionDetection}
      onDragStart={(event: DragStartEvent) => {
        setActiveId(String(event.active.id));
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
      }}
      autoScroll={{ canScroll: mayAutoScroll }}
      accessibility={{ announcements: boardAnnouncements(describe) }}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          {board.tiers.map((tier, index) => (
            <TierRow
              key={tier.id}
              tier={tier}
              films={(board.placements[tier.id] ?? [])
                .map((id) => byId.get(id))
                .filter((film): film is Film => film !== undefined)}
            >
              {/*
                Five controls on every row is a hundred and eighty pixels of
                chrome above a board that has to share a screen with its pool,
                and renaming a row is not what anyone came here to do. They are
                revealed together, by one switch, so the default board is
                colour and posters and nothing else.
              */}
              {editingRows && (
                <TierRowControls
                  tier={tier}
                  index={index}
                  tierCount={board.tiers.length}
                  dispatch={dispatch}
                />
              )}
            </TierRow>
          ))}
        </div>

        {/*
          The pool is the third column of the workspace on a wide screen, and
          stays in view as the rows scroll past beside it.

          A row and the pool have to be on screen together — you cannot drag a
          film to a row you cannot see, and there is no scrolling mid-drag —
          and six rows of posters plus a pool are taller than a laptop screen.
          A column of its own solves that by not competing for the same
          vertical space at all: nothing overlaps, nothing is painted over
          anything, and the rows keep the full height of the page.

          Narrower than `xl` there is no room for three columns, so the pool
          goes back under the board and the page scrolls as a document does.
          Reaching an off-screen row still works there: the window is a scroll
          ancestor of every card, so holding one against the top edge scrolls
          the page up to whatever row you want, and the drag overlay carries
          the card while the pool leaves the screen behind it.
        */}
        <div className="xl:sticky xl:top-4 xl:w-72 xl:shrink-0 2xl:w-80">
          <Pool
            films={poolFilms}
            search={search}
            onSearchChange={onSearchChange}
            notice={poolNotice}
          />
        </div>
      </div>

      {/* The pool is virtualised, so a card dragged out of it can be
          unmounted mid-drag — the row it is travelling towards changes the
          pool's contents, and the grid re-renders without it. Without an
          overlay the dragged element *is* that virtualised node, and the drag
          would lose the thing it is dragging. The overlay is a copy dnd-kit
          owns and positions itself, which outlives the source element by
          construction. (The pool's own auto-scroll used to unmount it too;
          see autoScroll.ts for why that no longer happens.) */}
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
