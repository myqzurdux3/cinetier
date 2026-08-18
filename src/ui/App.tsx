import { useCallback, useState } from 'react';
import { Shell } from './Shell';
import { SourcePicker, type ImportSource } from './import/SourcePicker';
import { ImportGuide } from './import/ImportGuide';
import { FilmGrid } from './library/FilmGrid';
import { LibrarySummary } from './library/LibrarySummary';
import { enrichLibrary } from '@/enrich/enrichLibrary';
import type { ImportOutcome } from './import/importFiles';
import type { Film } from '@/domain/film';

export default function App() {
  const [source, setSource] = useState<ImportSource | null>(null);
  const [films, setFilms] = useState<Film[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null);

  const onImported = useCallback(async (outcome: ImportOutcome) => {
    if (outcome.status !== 'ok') return;
    setFilms(outcome.films);
    setWarnings(outcome.warnings);
    setEnriching({ done: 0, total: outcome.films.length });

    const enriched = await enrichLibrary(outcome.films, (progress) => {
      setFilms(progress.films);
      setEnriching({ done: progress.done, total: progress.total });
    });

    setFilms(enriched);
    setEnriching(null);
  }, []);

  function reset() {
    setFilms(null);
    setWarnings([]);
    setEnriching(null);
    setSource(null);
  }

  if (films !== null) {
    return (
      <Shell>
        <div className="mx-auto max-w-6xl space-y-4 px-6 py-8">
          <LibrarySummary films={films} warnings={warnings} enriching={enriching} onReset={reset} />
          <FilmGrid films={films} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-6 py-16">
        {source === null ? (
          <>
            <h1 className="mb-3 text-center text-3xl font-semibold tracking-tight">
              Turn your film history into a tier list
            </h1>
            <p className="mb-10 text-center text-ink-dim">Where do you keep your films?</p>
            <SourcePicker onPick={setSource} />
          </>
        ) : (
          <ImportGuide
            source={source}
            onBack={() => setSource(null)}
            onImported={(outcome) => void onImported(outcome)}
          />
        )}
      </div>
    </Shell>
  );
}
