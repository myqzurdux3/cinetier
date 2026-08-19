import type { Film } from '@/domain/film';
import { TITLE_TYPE_LABELS, type TitleType } from '@/domain/titleType';

interface LibrarySummaryProps {
  films: Film[];
  warnings: string[];
  /** Entries the import understood but could never rank, such as video games. */
  skipped: number;
  enriching: { done: number; total: number } | null;
  onReset: () => void;
}

/** "12 films · 4 series", in descending order of how much of the library each holds. */
function breakdown(films: Film[]): string {
  const counts = new Map<TitleType, number>();
  for (const film of films) counts.set(film.titleType, (counts.get(film.titleType) ?? 0) + 1);

  return [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => {
      const label = TITLE_TYPE_LABELS[type];
      return `${count} ${count === 1 ? label.one : label.many}`;
    })
    .join(' · ');
}

export function LibrarySummary({
  films,
  warnings,
  skipped,
  enriching,
  onReset,
}: LibrarySummaryProps) {
  const rated = films.filter((film) => film.rating !== null).length;
  // A library of nothing but films should say "films", not the vaguer "titles"
  // it needs as soon as series are in there too.
  const onlyFilms = films.every((film) => film.titleType === 'movie');

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-line pb-4">
      <p className="text-lg">
        <span className="font-semibold">
          {films.length} {onlyFilms ? 'films' : 'titles'}
        </span>
        <span className="text-ink-dim"> · {rated} rated</span>
        {!onlyFilms && <span className="text-ink-dim"> · {breakdown(films)}</span>}
        {skipped > 0 && <span className="text-ink-dim"> · {skipped} skipped</span>}
      </p>

      {enriching && (
        <p className="text-sm text-ink-dim" aria-live="polite">
          Finding posters… {enriching.done} of {enriching.total}
        </p>
      )}

      <button
        type="button"
        onClick={onReset}
        className="ml-auto text-sm text-ink-dim underline underline-offset-4 hover:text-ink"
      >
        Import a different export
      </button>

      {warnings.length > 0 && (
        <details className="w-full text-sm text-ink-dim">
          <summary className="cursor-pointer">
            {warnings.length} row{warnings.length === 1 ? '' : 's'} could not be read
          </summary>
          <ul className="mt-2 space-y-1">
            {/* Keyed by position: two untitled rows warn in identical words, and
                the list is static for as long as it is on screen. */}
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
