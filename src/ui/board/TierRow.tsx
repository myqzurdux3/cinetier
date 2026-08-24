import { useMemo, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Film } from '@/domain/film';
import type { Tier, TierColor } from '@/domain/tiers';
import { BoardCard } from './BoardCard';

/**
 * A token name from the domain becomes that token and nothing else. This is a
 * template over six known names, not a colour value — which is what keeps
 * src/ui/** free of colour literals while still letting a row be recoloured.
 */
export function tierColorVar(color: TierColor): string {
  return `var(--color-tier-${color})`;
}

interface TierRowProps {
  tier: Tier;
  films: Film[];
  /** The row's edit controls, mounted by Task 10. */
  children?: ReactNode;
}

export function TierRow({ tier, films, children }: TierRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `tier:${tier.id}`,
    data: { type: 'tier', tierId: tier.id },
  });

  const label = `${tier.label} — ${films.length === 1 ? '1 film' : `${String(films.length)} films`}`;
  // A fresh array here would make SortableContext recompute its order on every
  // render, and during a drag there are a great many of those.
  const ids = useMemo(() => films.map((film) => film.id), [films]);

  return (
    <div className="flex items-stretch gap-2">
      <div
        className="flex w-14 shrink-0 items-center justify-center rounded-card font-display text-lg text-on-accent"
        style={{ backgroundColor: tierColorVar(tier.color) }}
      >
        {tier.label}
      </div>

      <div className="min-w-0 flex-1">
        {children}
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <ul
            ref={setNodeRef}
            aria-label={label}
            className={`flex min-h-24 flex-wrap gap-2 rounded-card border p-2 ${
              isOver ? 'border-accent' : 'border-line'
            }`}
          >
            {films.length === 0 ? (
              <li className="self-center px-2 text-sm text-ink-dim">Drop films here</li>
            ) : (
              films.map((film) => (
                <li key={film.id} className="w-16 shrink-0 sm:w-20">
                  <BoardCard film={film} tierId={tier.id} />
                </li>
              ))
            )}
          </ul>
        </SortableContext>
      </div>
    </div>
  );
}
