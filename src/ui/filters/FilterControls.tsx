import { useState } from 'react';
import { CheckboxList } from './CheckboxList';
import { CheckField, DateField, NumberField } from './fields';
import {
  availableDecades,
  availableDirectors,
  availableGenres,
  availableTitleTypes,
  runtimeBounds,
  type FilterCriteria,
} from '@/domain/filters';
import { TITLE_TYPE_LABELS } from '@/domain/titleType';
import type { Film } from '@/domain/film';

export interface ControlsProps {
  films: Film[];
  criteria: FilterCriteria;
  onChange: (next: FilterCriteria) => void;
}

export function RatingControls({ criteria, onChange }: ControlsProps) {
  return (
    <>
      <NumberField
        label="Minimum rating"
        value={criteria.minRating}
        min={0}
        max={100}
        onChange={(value) => onChange({ ...criteria, minRating: value })}
      />
      <NumberField
        label="Maximum rating"
        value={criteria.maxRating}
        min={0}
        max={100}
        onChange={(value) => onChange({ ...criteria, maxRating: value })}
      />
      <CheckField
        label="Only unrated titles"
        checked={criteria.onlyUnrated ?? false}
        onChange={(checked) => onChange({ ...criteria, onlyUnrated: checked })}
      />
      <NumberField
        label="Above the public score by at least"
        value={criteria.minRatingDelta}
        min={0}
        max={100}
        onChange={(value) => onChange({ ...criteria, minRatingDelta: value })}
      />
      <NumberField
        label="Below the public score by at least"
        // Stored as a negative delta — "at most -10" is the predicate — but a
        // reader setting "10 below" should type 10, not -10.
        value={
          criteria.maxRatingDelta === undefined ? undefined : Math.abs(criteria.maxRatingDelta)
        }
        min={0}
        max={100}
        onChange={(value) =>
          onChange({ ...criteria, maxRatingDelta: value === undefined ? undefined : -value })
        }
      />
      <p className="text-xs text-ink-dim">
        Ratings are on one 0–100 scale, whichever service they came from.
      </p>
    </>
  );
}

export function EraControls({ films, criteria, onChange }: ControlsProps) {
  const options = availableDecades(films).map((decade) => ({
    value: decade,
    label: `${decade}s`,
  }));

  return (
    <CheckboxList
      options={options}
      selected={criteria.decades ?? []}
      onChange={(decades) => onChange({ ...criteria, decades })}
    />
  );
}

export function TypeControls({ films, criteria, onChange }: ControlsProps) {
  const options = availableTitleTypes(films)
    .map((type) => ({ value: type, label: TITLE_TYPE_LABELS[type].many }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <CheckboxList
      options={options}
      selected={criteria.titleTypes ?? []}
      onChange={(titleTypes) => onChange({ ...criteria, titleTypes })}
    />
  );
}

export function GenreControls({ films, criteria, onChange }: ControlsProps) {
  const options = availableGenres(films).map((genre) => ({ value: genre, label: genre }));

  return (
    <CheckboxList
      options={options}
      selected={criteria.genres ?? []}
      onChange={(genres) => onChange({ ...criteria, genres })}
    />
  );
}

/** A big library holds hundreds of directors; a list that long is not a control. */
const DIRECTOR_LIMIT = 50;

export function DirectorControls({ films, criteria, onChange }: ControlsProps) {
  const [query, setQuery] = useState('');
  const selected = criteria.directors ?? [];

  const directors = availableDirectors(films);
  const needle = query.trim().toLowerCase();
  const matching =
    needle === '' ? directors : directors.filter((name) => name.toLowerCase().includes(needle));
  const shown = matching.slice(0, DIRECTOR_LIMIT);

  // Anything already chosen stays on screen whatever the search says, so a
  // filter can always be undone from the control that set it.
  const options = [...new Set([...selected, ...shown])].map((name) => ({
    value: name,
    label: name,
  }));

  return (
    <>
      <input
        type="search"
        value={query}
        aria-label="Search directors"
        placeholder="Search directors"
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-card border border-line bg-surface-raised px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <CheckboxList
        options={options}
        selected={selected}
        onChange={(directors) => onChange({ ...criteria, directors })}
      />
      {matching.length > shown.length && (
        <p className="text-xs text-ink-dim">
          Showing {shown.length} of {matching.length}. Type to narrow the list.
        </p>
      )}
    </>
  );
}

export function RuntimeControls({ films, criteria, onChange }: ControlsProps) {
  const bounds = runtimeBounds(films);

  return (
    <>
      <NumberField
        label="Shortest"
        value={criteria.minRuntimeMinutes}
        min={0}
        onChange={(value) => onChange({ ...criteria, minRuntimeMinutes: value })}
      />
      <NumberField
        label="Longest"
        value={criteria.maxRuntimeMinutes}
        min={0}
        onChange={(value) => onChange({ ...criteria, maxRuntimeMinutes: value })}
      />
      <p className="text-xs text-ink-dim">
        {bounds
          ? `This library runs ${bounds.min} to ${bounds.max} minutes.`
          : 'No runtimes known yet.'}
      </p>
    </>
  );
}

export function WatchedControls({ criteria, onChange }: ControlsProps) {
  return (
    <>
      <DateField
        label="Watched after"
        value={criteria.watchedAfter}
        onChange={(value) => onChange({ ...criteria, watchedAfter: value })}
      />
      <DateField
        label="Watched before"
        value={criteria.watchedBefore}
        onChange={(value) => onChange({ ...criteria, watchedBefore: value })}
      />
      <CheckField
        label="Only rewatches"
        checked={criteria.onlyRewatches ?? false}
        onChange={(checked) => onChange({ ...criteria, onlyRewatches: checked })}
      />
      <p className="text-xs text-ink-dim">
        IMDb exports carry the date you rated a title, not the date you watched it.
      </p>
    </>
  );
}

export function TopNControls({ criteria, onChange }: ControlsProps) {
  return (
    <>
      <NumberField
        label="Keep the top"
        value={criteria.topN}
        min={1}
        onChange={(value) => onChange({ ...criteria, topN: value })}
      />
      <p className="text-xs text-ink-dim">Applied last, after every other filter.</p>
    </>
  );
}
