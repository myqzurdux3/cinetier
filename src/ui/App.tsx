import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shell } from './Shell';
import { Landing } from './Landing';
import type { ImportSource } from './import/SourcePicker';
import { ImportGuide } from './import/ImportGuide';
import { FilmGrid } from './library/FilmGrid';
import { LibraryHeader } from './library/LibraryHeader';
import { FilterRail } from './filters/FilterRail';
import { FilterStatus } from './filters/FilterStatus';
import { NoResults } from './filters/NoResults';
import { enrichLibrary } from '@/enrich/enrichLibrary';
import { saveLibrary, loadLibrary, clearLibrary } from '@/services/library';
import { applyFilters, activeCriteria, type FilterCriteria } from '@/domain/filters';
import { saveFilters, loadFilters, clearFilters } from '@/services/filters';
import { enrichDetails, countPendingDetails } from '@/enrich/enrichDetails';
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

  const [criteria, setCriteria] = useState<FilterCriteria>({});
  const [fetchingDetails, setFetchingDetails] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [railOpen, setRailOpen] = useState(false);

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
    loadFilters()
      .then((restored) => {
        if (restored) setCriteria(restored);
      })
      .catch((error: unknown) => {
        // A lost preference costs a click. Letting it propagate would cost the page.
        console.error('Failed to restore the saved filters', error);
      });
  }, []);

  const updateCriteria = useCallback((next: FilterCriteria) => {
    setCriteria(next);
    // Writing {} back would restore as a filtered view that admits everything.
    const written = activeCriteria(next).length > 0 ? saveFilters(next) : clearFilters();
    written.catch((error: unknown) => {
      console.error('Failed to save the filters', error);
    });
  }, []);

  // The second pass. It runs after the poster pass rather than beside it: the
  // grid is useless without posters and merely less filterable without genres,
  // and running both at once doubles the requests in flight.
  const fillInDetails = useCallback(async (library: Film[], id: number) => {
    const total = countPendingDetails(library);
    if (total === 0) return;

    setFetchingDetails({ done: 0, total });
    const detailed = await enrichDetails(library, (progress) => {
      if (runId.current !== id) return;
      setFilms(progress.films);
      setFetchingDetails({ done: progress.done, total: progress.total });
    });

    if (runId.current !== id) return;
    setFilms(detailed);
    setFetchingDetails(null);
    await saveLibrary(detailed);
  }, []);

  useEffect(() => {
    loadLibrary()
      .then((restored) => {
        if (!restored || restoreCancelled.current) return;
        setFilms(restored);
        const id = ++runId.current;
        return fillInDetails(restored, id);
      })
      .catch((error: unknown) => {
        console.error('Failed to restore the saved library', error);
      });
  }, [fillInDetails]);

  const onImported = useCallback(
    async (outcome: ImportOutcome) => {
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
      await fillInDetails(enriched, id);
    },
    [fillInDetails],
  );

  // Before the early return, so the hook order never depends on whether a
  // library has been imported yet.
  const visible = useMemo(() => (films ? applyFilters(films, criteria) : []), [films, criteria]);

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
    setCriteria({});
    setFetchingDetails(null);
    clearFilters().catch((error: unknown) => {
      console.error('Failed to clear the saved filters', error);
    });
    setSource(null);
  }

  if (films !== null) {
    // NoResults is only coherent when a criterion is actually cutting films —
    // with no active criterion, `visible.length === 0` means the library
    // itself is empty, and "Nothing matches these filters" would name the
    // wrong cause and offer a "Clear all filters" button that clears nothing.
    const filtered = activeCriteria(criteria).length > 0 && visible.length === 0;

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

          {/* Below the rail's breakpoint the column becomes a sheet: same
              markup, opened on demand, so nothing has to render twice. */}
          <button
            type="button"
            onClick={() => setRailOpen((open) => !open)}
            aria-expanded={railOpen}
            aria-controls="filter-rail"
            className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink lg:hidden"
          >
            Filters
          </button>

          <div className="flex flex-col gap-4 lg:flex-row">
            <aside
              id="filter-rail"
              className={`${railOpen ? 'block' : 'hidden'} shrink-0 lg:block lg:w-64`}
            >
              <FilterRail
                films={films}
                criteria={criteria}
                onChange={updateCriteria}
                fetchingDetails={fetchingDetails}
              />
            </aside>

            <div className="min-w-0 flex-1 space-y-3">
              {/* FilterStatus's own "Clear all filters" chip and NoResults's
                  button share that exact accessible name. Showing FilterStatus
                  only while something is visible keeps the two from ever
                  mounting together, so neither query nor screen reader user
                  meets two buttons with the same name at once. */}
              {!filtered && (
                <FilterStatus
                  films={films}
                  visible={visible}
                  criteria={criteria}
                  onChange={updateCriteria}
                />
              )}
              {filtered ? (
                <NoResults films={films} criteria={criteria} onChange={updateCriteria} />
              ) : (
                <FilmGrid films={visible} generation={generation} />
              )}
            </div>
          </div>
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
