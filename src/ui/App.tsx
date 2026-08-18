import { useCallback, useEffect, useRef, useState } from 'react';
import { Shell } from './Shell';
import { SourcePicker, type ImportSource } from './import/SourcePicker';
import { ImportGuide } from './import/ImportGuide';
import { FilmGrid } from './library/FilmGrid';
import { LibrarySummary } from './library/LibrarySummary';
import { enrichLibrary } from '@/enrich/enrichLibrary';
import { saveLibrary, loadLibrary, clearLibrary } from '@/services/library';
import type { ImportOutcome } from './import/importFiles';
import type { Film } from '@/domain/film';

export default function App() {
  const [source, setSource] = useState<ImportSource | null>(null);
  const [films, setFilms] = useState<Film[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null);

  // Restore whatever was saved last time. `restoreCancelled` is set the moment
  // the user does anything that should win over the restore — starts an
  // import, or resets — so the restore's own .then() can check it and no-op
  // no matter how late it resolves. This is deliberately not inferred from
  // `films` (e.g. "only restore if films is still null"): films can go
  // non-null and back to null again (import, then reset) before this promise
  // ever settles, and at that point `films === null` would look exactly like
  // "nothing happened yet" even though the user explicitly discarded a
  // library in between. A ref set synchronously by the actions that should
  // pre-empt the restore is the only thing immune to that.
  const restoreCancelled = useRef(false);

  useEffect(() => {
    loadLibrary()
      .then((restored) => {
        if (restored && !restoreCancelled.current) setFilms(restored);
      })
      .catch((error: unknown) => {
        console.error('Failed to restore the saved library', error);
      });
  }, []);

  const onImported = useCallback(async (outcome: ImportOutcome) => {
    if (outcome.status !== 'ok') return;
    restoreCancelled.current = true;
    setFilms(outcome.films);
    setWarnings(outcome.warnings);
    setEnriching({ done: 0, total: outcome.films.length });

    const enriched = await enrichLibrary(outcome.films, (progress) => {
      setFilms(progress.films);
      setEnriching({ done: progress.done, total: progress.total });
    });

    setFilms(enriched);
    setEnriching(null);
    await saveLibrary(enriched);
  }, []);

  function reset() {
    restoreCancelled.current = true;
    clearLibrary().catch((error: unknown) => {
      console.error('Failed to clear the saved library', error);
    });
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
