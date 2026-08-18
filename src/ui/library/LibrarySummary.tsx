import type { Film } from '@/domain/film';

interface LibrarySummaryProps {
  films: Film[];
  warnings: string[];
  enriching: { done: number; total: number } | null;
  onReset: () => void;
}

export function LibrarySummary({ films, warnings, enriching, onReset }: LibrarySummaryProps) {
  const rated = films.filter((film) => film.rating !== null).length;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-line pb-4">
      <p className="text-lg">
        <span className="font-semibold">{films.length} films</span>
        <span className="text-ink-dim"> · {rated} rated</span>
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
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
