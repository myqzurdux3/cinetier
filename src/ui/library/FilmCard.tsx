import type { Film } from '@/domain/film';
import { formatRating } from '@/domain/rating';
import { posterUrl } from '@/services/tmdb';

interface FilmCardProps {
  film: Film;
}

export function FilmCard({ film }: FilmCardProps) {
  return (
    <figure className="group relative overflow-hidden rounded-card bg-surface">
      <div className="aspect-[2/3] w-full">
        {film.posterPath ? (
          <img
            src={posterUrl(film.posterPath)}
            alt={film.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col justify-end p-3">
            <span className="text-sm font-medium leading-tight">{film.title}</span>
            {film.year !== null && <span className="mt-1 text-xs text-ink-dim">{film.year}</span>}
          </div>
        )}
      </div>

      {film.rating !== null && (
        <figcaption className="absolute right-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 font-display text-xs tracking-wide text-on-accent">
          {formatRating(film.rating, film.ratingScale)}
        </figcaption>
      )}
    </figure>
  );
}
