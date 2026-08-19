import { CheckboxList } from './CheckboxList';
import { CheckField, NumberField } from './fields';
import { availableDecades, availableTitleTypes, type FilterCriteria } from '@/domain/filters';
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
