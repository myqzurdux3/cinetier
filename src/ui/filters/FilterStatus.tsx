import { useRef } from 'react';
import {
  activeCriteria,
  describeCriterion,
  withoutCriterion,
  type FilterCriteria,
} from '@/domain/filters';
import type { Film } from '@/domain/film';

/**
 * Shared with NoResults, which lives in a different component but removes
 * criteria the same way — see the focus-management comment below.
 */
export const FILTER_STATUS_ID = 'filter-status';

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
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Every removal here unmounts the very button the user just activated — a
   * chip, or the clear-all button. Left alone, focus falls to <body>, which
   * strands a keyboard user at the top of the document on the rail's most
   * common interaction. This wrapper is always mounted (see the live
   * region's own comment below), so it is a stable place to send focus
   * instead: `tabIndex={-1}` makes it focusable programmatically without
   * adding a stop to the Tab order.
   */
  function removeAndRefocus(next: FilterCriteria) {
    onChange(next);
    containerRef.current?.focus();
  }

  return (
    <div
      ref={containerRef}
      id={FILTER_STATUS_ID}
      tabIndex={-1}
      className="flex flex-wrap items-center gap-2 rounded-card focus:outline-none focus:ring-2 focus:ring-accent"
    >
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
            onClick={() => removeAndRefocus(withoutCriterion(criteria, key))}
            className={CHIP}
          >
            {description} <span aria-hidden="true">×</span>
          </button>
        );
      })}

      {active.length > 0 && showClearAll && (
        <button type="button" onClick={() => removeAndRefocus({})} className={CHIP}>
          Clear all filters
        </button>
      )}
    </div>
  );
}
