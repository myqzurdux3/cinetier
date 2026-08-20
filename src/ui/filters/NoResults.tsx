import {
  describeCriterion,
  mostRestrictiveCriterion,
  withoutCriterion,
  type FilterCriteria,
} from '@/domain/filters';
import type { Film } from '@/domain/film';

interface NoResultsProps {
  films: Film[];
  criteria: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
}

const ACTION =
  'rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent';

/**
 * Eleven axes make zero results the most common state of the rail, and an empty
 * grid with no explanation is a failure this project has shipped once already,
 * when an import produced no films.
 */
export function NoResults({ films, criteria, onChange }: NoResultsProps) {
  const culprit = mostRestrictiveCriterion(films, criteria);
  const description = culprit ? describeCriterion(culprit, criteria) : null;

  return (
    <div className="space-y-3 rounded-card bg-surface px-5 py-10 text-center">
      <p className="font-display text-lg text-ink">Nothing matches these filters.</p>

      {culprit && description ? (
        <>
          <p className="text-sm text-ink-dim">{description} is cutting the most.</p>
          <button
            type="button"
            onClick={() => onChange(withoutCriterion(criteria, culprit))}
            className={ACTION}
          >
            Remove {description}
          </button>
        </>
      ) : (
        <p className="text-sm text-ink-dim">
          No single filter explains it — several are combining to exclude everything.
        </p>
      )}

      <div>
        <button type="button" onClick={() => onChange({})} className={ACTION}>
          Clear all filters
        </button>
      </div>
    </div>
  );
}
