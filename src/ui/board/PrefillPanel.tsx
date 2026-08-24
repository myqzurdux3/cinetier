import { useId, useMemo } from 'react';
import type { Film } from '@/domain/film';
import { poolFor, prefill, type TierBoard } from '@/domain/tiers';
import type { BoardAction } from '@/domain/board';

interface PrefillPanelProps {
  board: TierBoard;
  films: Film[];
  dispatch: (action: BoardAction) => void;
}

export function PrefillPanel({ board, films, dispatch }: PrefillPanelProps) {
  const groupId = useId();

  // What pre-filling would do right now, computed by running the real
  // operation rather than by reimplementing its rules here — a preview that
  // disagrees with the action is worse than no preview.
  const preview = useMemo(() => prefill(board, films), [board, films]);
  const pooled = useMemo(() => poolFor(board, films), [board, films]);
  const unratedCount = pooled.filter((film) => film.rating === null).length;

  const gained = (tierId: string) =>
    (preview.placements[tierId]?.length ?? 0) - (board.placements[tierId]?.length ?? 0);

  const wouldPlace = board.tiers.reduce((total, tier) => total + gained(tier.id), 0);

  return (
    <section className="space-y-3 rounded-card border border-line p-3">
      {/*
        Collapsed by default. Six threshold rows are three hundred pixels of
        form above a board that has to share one screen with its pool, and the
        thresholds are something you set once, if ever — while the two buttons
        below are what the panel is for, so they stay outside and always
        visible. The summary carries the number the fieldset exists to produce,
        so a reader who never opens it still knows what the button will do.
      */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-ink-dim hover:text-ink">
          Pre-fill thresholds
          <span className="ml-2 text-ink">
            {wouldPlace === 1 ? 'would place 1 film' : `would place ${String(wouldPlace)} films`}
          </span>
        </summary>
        <fieldset id={groupId} aria-label="Pre-fill thresholds" className="mt-2 space-y-2">
          {board.tiers.map((tier) => (
            <div key={tier.id} className="flex flex-wrap items-center gap-3 text-sm">
              <label htmlFor={`${groupId}-${tier.id}`} className="text-ink-dim">
                {tier.label} — lowest rating
              </label>
              <input
                id={`${groupId}-${tier.id}`}
                type="number"
                min={0}
                max={100}
                value={tier.minRating ?? ''}
                placeholder="everything else"
                onChange={(event) => {
                  const raw = event.target.value;
                  dispatch({
                    type: 'setThreshold',
                    tierId: tier.id,
                    minRating: raw === '' ? null : Number(raw),
                  });
                }}
                className="w-24 rounded-card border border-line bg-surface px-2 py-1 text-ink focus:ring-2 focus:ring-accent"
              />
              <span className="text-ink-dim">{`${tier.label} would take ${String(gained(tier.id))}`}</span>
            </div>
          ))}
        </fieldset>

        {unratedCount > 0 && (
          <p className="mt-2 text-sm text-ink-dim">
            {unratedCount === 1
              ? '1 unrated film stays in the pool — a rating is what this sorts by.'
              : `${String(unratedCount)} unrated films stay in the pool — a rating is what this sorts by.`}
          </p>
        )}
      </details>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'prefill', films });
          }}
          className="rounded-card border border-line px-3 py-2 text-sm text-ink hover:border-accent focus:ring-2 focus:ring-accent"
        >
          Pre-fill from my ratings
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'clearToPool' });
          }}
          className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent"
        >
          Send everything back to the pool
        </button>
      </div>
    </section>
  );
}
