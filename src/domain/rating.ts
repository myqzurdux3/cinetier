/**
 * A tuple, not a bare union, so the members can be enumerated at runtime.
 * Validating a file this application wrote needs to ask "is this one of
 * them?", and a type alone cannot answer that.
 */
export const RATING_SCALES = ['imdb10', 'letterboxd5'] as const;

export type RatingScale = (typeof RATING_SCALES)[number];

interface ScaleDefinition {
  min: number;
  max: number;
  step: number;
}

const SCALES: Record<RatingScale, ScaleDefinition> = {
  imdb10: { min: 1, max: 10, step: 1 },
  letterboxd5: { min: 0.5, max: 5, step: 0.5 },
};

/** Convert a rating in its native scale to the internal 0-100 representation. */
export function normalizeRating(raw: number, scale: RatingScale): number {
  const { min, max } = SCALES[scale];
  if (!Number.isFinite(raw) || raw < min || raw > max) {
    throw new RangeError(`Rating ${raw} is out of range for scale ${scale} (${min}-${max}).`);
  }
  // Round to two decimals: (8.7 / 10) * 100 is 87.00000000000001 in binary
  // floating point, and a rating that fails an equality check is a rating bug.
  return Math.round((raw / max) * 10000) / 100;
}

/** Convert an internal 0-100 rating back to the nearest valid value in the target scale. */
export function denormalizeRating(normalized: number, scale: RatingScale): number {
  const { max, step } = SCALES[scale];
  const exact = (normalized / 100) * max;
  const snapped = Math.round(exact / step) * step;
  // Guard against binary floating point residue such as 3.5000000000000004.
  return Number(snapped.toFixed(1));
}

/** Render a rating for display in its source scale. */
export function formatRating(normalized: number, scale: RatingScale): string {
  const value = denormalizeRating(normalized, scale);
  if (scale === 'imdb10') return `${value}/10`;
  const full = Math.floor(value);
  return '★'.repeat(full) + (value % 1 === 0.5 ? '½' : '');
}
