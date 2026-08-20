import {
  activeCriteria,
  describeCriterion,
  withoutCriterion,
  type FilterCriteria,
} from '@/domain/filters';
import type { Film } from '@/domain/film';

interface FilterStatusProps {
  films: Film[];
  visible: Film[];
  criteria: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
  /**
   * False while some other element on the page — currently NoResults, when
   * there are zero visible films — is already offering its own "Clear all
   * filters" button. Whether that's true depends on what else the caller is
   * rendering beside this component, which this component cannot see, so the
   * caller says so explicitly rather than this inferring it from `visible`.
   * Defaults to true: shown whenever a criterion is active, as before.
   */
  showClearAll?: boolean;
}

const CHIP =
  'rounded-card border border-line px-2 py-1 text-xs text-ink-dim hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent';

export function FilterStatus({
  films,
  visible,
  criteria,
  onChange,
  showClearAll = true,
}: FilterStatusProps) {
  const active = activeCriteria(criteria);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Always mounted, never conditionally rendered: a live region that
          appears at the same moment as its message is routinely missed. */}
      <p aria-live="polite" className="text-sm text-ink">
        {visible.length} of {films.length} titles
      </p>

      {active.map((key) => {
        const description = describeCriterion(key, criteria);
        return (
          <button
            key={key}
            type="button"
            aria-label={`Remove filter: ${description}`}
            onClick={() => onChange(withoutCriterion(criteria, key))}
            className={CHIP}
          >
            {description} <span aria-hidden="true">×</span>
          </button>
        );
      })}

      {active.length > 0 && showClearAll && (
        <button type="button" onClick={() => onChange({})} className={CHIP}>
          Clear all filters
        </button>
      )}
    </div>
  );
}
