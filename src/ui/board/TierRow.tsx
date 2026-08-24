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
      {/*
        `text-center` as well as `justify-center`: the flex rule centres this
        block's single line box, and does nothing about the lines inside it
        once a label wraps. A row called "Chefs-d'œuvre absolus" came out
        ragged-left in a centred block.

        `wrap-anywhere` rather than `break-words`, because a label is one field
        a person types into and can hold anything. An unbroken twenty-letter
        word overflowed the coloured block by sixty-one pixels, printing over
        the row beside it; `break-words` brought that down to thirty-seven and
        no further, since it only breaks a word once the line is already full.
        `anywhere` also counts the break when the browser works out how narrow
        the block may be, which is what actually contains it.

        The type is sized by what it holds. This block is narrow by design —
        the letters S through F are what it is shaped for, and they should
        look like a tier list's letters — but a name of any length has to fit
        the same column, and at that size it cannot.
      */}
      <div
        className={`flex w-16 shrink-0 items-center justify-center wrap-anywhere rounded-card px-1 py-1 text-center font-display leading-tight text-on-accent ${
          tier.label.length <= 2 ? 'text-xl' : 'text-sm'
        }`}
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
