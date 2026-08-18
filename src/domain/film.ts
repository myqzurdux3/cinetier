import type { RatingScale } from './rating';

export type FilmSource = 'imdb' | 'letterboxd';

/**
 * One film in the user's library, normalized across services.
 * Every parser produces this shape; nothing downstream knows where it came from.
 */
export interface Film {
  /** Stable identity: "imdb:tt0133093", "lb:the-matrix", or "tmdb:603". */
  id: string;
  imdbId: string | null;
  tmdbId: number | null;
  title: string;
  year: number | null;
  /** Normalized 0-100, or null when the film was watched but not rated. */
  rating: number | null;
  /** The scale this rating was originally expressed in, for display. */
  ratingScale: RatingScale;
  watchedAt: Date | null;
  /**
   * True when watchedAt is really a "date rated" standing in for a watch date.
   * IMDb does not export watch dates; the UI must say so rather than imply precision.
   */
  watchedAtIsApproximate: boolean;
  isRewatch: boolean;
  genres: string[];
  directors: string[];
  runtimeMinutes: number | null;
  /** Normalized 0-100 public rating, when the source provides one. */
  publicRating: number | null;
  posterPath: string | null;
  source: FilmSource;
}
