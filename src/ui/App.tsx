import { useCallback, useEffect, useRef, useState } from 'react';
import { Shell } from './Shell';
import { Landing } from './Landing';
import type { ImportSource } from './import/SourcePicker';
import { ImportGuide } from './import/ImportGuide';
import { FilmGrid } from './library/FilmGrid';
import { LibraryHeader } from './library/LibraryHeader';
import { enrichLibrary } from '@/enrich/enrichLibrary';
import { saveLibrary, loadLibrary, clearLibrary } from '@/services/library';
import type { ImportOutcome } from './import/importFiles';
import type { Film } from '@/domain/film';

export default function App() {
  const [source, setSource] = useState<ImportSource | null>(null);
  const [films, setFilms] = useState<Film[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null);
  // Bumped once per import (not the enrichment guard's runId, which is a ref
  // and does not re-render). This is what tells the grid to replay its
  // entrance animation.
  const [generation, setGeneration] = useState(0);

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

  // The same idea one step further, for enrichment. An enrichment run outlives
  // the screen that started it — it reports per resolved film for seconds or
  // minutes, and "Import a different export" sits right beside its progress —
  // so a reset or a second import can easily land mid-run. Each run takes the
  // current id and checks it before every write; anything that discards a
  // library bumps the id, which makes every later callback from the run that
  // produced it a no-op. Nothing else distinguishes two runs from each other.
  const runId = useRef(0);

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
    const id = ++runId.current;
    setFilms(outcome.films);
    setGeneration((n) => n + 1);
    setWarnings(outcome.warnings);
    setSkipped(outcome.skipped);
    setEnriching({ done: 0, total: outcome.films.length });

    const enriched = await enrichLibrary(outcome.films, (progress) => {
      if (runId.current !== id) return;
      setFilms(progress.films);
      setEnriching({ done: progress.done, total: progress.total });
    });

    if (runId.current !== id) return;
    setFilms(enriched);
    setEnriching(null);
    await saveLibrary(enriched);
  }, []);

  function reset() {
    restoreCancelled.current = true;
    runId.current += 1;
    clearLibrary().catch((error: unknown) => {
      console.error('Failed to clear the saved library', error);
    });
    setFilms(null);
    setWarnings([]);
    setSkipped(0);
    setEnriching(null);
    setSource(null);
  }

  if (films !== null) {
    return (
      <Shell>
        <div className="mx-auto max-w-7xl space-y-4 px-6 py-8">
          <LibraryHeader
            films={films}
            warnings={warnings}
            skipped={skipped}
            enriching={enriching}
            onReset={reset}
          />
          <FilmGrid films={films} generation={generation} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {source === null ? (
        <Landing onPick={setSource} />
      ) : (
        <div className="mx-auto max-w-2xl px-6 py-16">
          <ImportGuide
            source={source}
            onBack={() => setSource(null)}
            onImported={(outcome) => {
              // Neither the enrichment nor the save that onImported awaits has
              // a handler of its own, and DropZone cannot await this callback,
              // so an unhandled rejection would be the only trace of a failure.
              onImported(outcome).catch((error: unknown) => {
                console.error('Failed to finish importing the library', error);
              });
            }}
          />
        </div>
      )}
    </Shell>
  );
}
