import { FilterSection } from './FilterSection';
import {
  RatingControls,
  EraControls,
  TypeControls,
  GenreControls,
  DirectorControls,
  RuntimeControls,
  WatchedControls,
  TopNControls,
  type ControlsProps,
} from './FilterControls';
import {
  applyFilters,
  subsetCriteria,
  type CriterionKey,
  type FilterCriteria,
} from '@/domain/filters';
import type { Film } from '@/domain/film';
import type { ReactNode } from 'react';

interface SectionSpec {
  title: string;
  /** The criteria this section owns — what its own count is computed from. */
  keys: readonly CriterionKey[];
  open: boolean;
  /** True for the three sections whose options come from the details pass. */
  needsDetails?: boolean;
  Controls: (props: ControlsProps) => ReactNode;
}

const SECTIONS: readonly SectionSpec[] = [
  {
    title: 'Rating',
    keys: ['minRating', 'maxRating', 'onlyUnrated', 'minRatingDelta', 'maxRatingDelta'],
    open: true,
    Controls: RatingControls,
  },
  { title: 'Era', keys: ['decades'], open: true, Controls: EraControls },
  { title: 'Type', keys: ['titleTypes'], open: true, Controls: TypeControls },
  { title: 'Genre', keys: ['genres'], open: false, needsDetails: true, Controls: GenreControls },
  {
    title: 'Director',
    keys: ['directors'],
    open: false,
    needsDetails: true,
    Controls: DirectorControls,
  },
  {
    title: 'Runtime',
    keys: ['minRuntimeMinutes', 'maxRuntimeMinutes'],
    open: false,
    needsDetails: true,
    Controls: RuntimeControls,
  },
  {
    title: 'Watched',
    keys: ['watchedAfter', 'watchedBefore', 'onlyRewatches'],
    open: false,
    Controls: WatchedControls,
  },
  { title: 'Top N', keys: ['topN'], open: false, Controls: TopNControls },
];

interface FilterRailProps {
  films: Film[];
  criteria: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
  /** Non-null while genres, directors and runtimes are still arriving. */
  fetchingDetails: { done: number; total: number } | null;
}

export function FilterRail({ films, criteria, onChange, fetchingDetails }: FilterRailProps) {
  const remaining = fetchingDetails ? fetchingDetails.total - fetchingDetails.done : 0;
  const note = `Looking up genres and directors… ${remaining} to go`;

  return (
    <div className="space-y-2">
      {SECTIONS.map(({ title, keys, open, needsDetails, Controls }) => (
        <FilterSection
          key={title}
          title={title}
          // Each section's own share of the criteria, so the header says what
          // this section is cutting rather than what the rail is cutting.
          count={applyFilters(films, subsetCriteria(criteria, keys)).length}
          total={films.length}
          defaultOpen={open}
          disabled={Boolean(needsDetails && fetchingDetails)}
          disabledNote={note}
        >
          <Controls films={films} criteria={criteria} onChange={onChange} />
        </FilterSection>
      ))}
    </div>
  );
}
