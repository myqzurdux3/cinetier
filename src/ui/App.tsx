import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shell } from './Shell';
import { Landing } from './Landing';
import type { ImportSource } from './import/SourcePicker';
import { ImportGuide } from './import/ImportGuide';
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
import { boardReducer, type BoardAction } from '@/domain/board';
import { createBoard, poolFor, type TierBoard } from '@/domain/tiers';
import { initHistory, record, undo, redo, canUndo, canRedo, type History } from '@/domain/history';
import { saveBoard, loadFirstBoard, clearBoards } from '@/services/boards';
import { BoardScreen } from './board/BoardScreen';
import { PrefillPanel } from './board/PrefillPanel';
import { ResetConfirm } from './ResetConfirm';

/**
 * Which text field an action is typing into, or null for an action that stands
 * on its own. Two consecutive actions sharing a key are one edit as far as
 * undo is concerned.
 *
 * Deliberately per-field rather than per-type: renaming row S and then row A
 * are two separate edits, and undo should return them one at a time.
 */
function coalesceKey(action: BoardAction): string | null {
  switch (action.type) {
    case 'renameTier':
      return `renameTier:${action.tierId}`;
    case 'setThreshold':
      return `setThreshold:${action.tierId}`;
    case 'renameBoard':
      return 'renameBoard';
    default:
      return null;
  }
}

export default function App() {
  const [source, setSource] = useState<ImportSource | null>(null);
  const [films, setFilms] = useState<Film[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null);

  const [criteria, setCriteria] = useState<FilterCriteria>({});
  const [fetchingDetails, setFetchingDetails] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [railOpen, setRailOpen] = useState(false);

  const [history, setHistory] = useState<History<TierBoard>>(() =>
    initHistory(createBoard('board-1', 'My ranking')),
  );
  const [poolSearch, setPoolSearch] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const boardValue = history.present;

  // What the last recorded edit was, and the history it was recorded into.
  //
  // The key identifies "the same text field being typed into": consecutive
  // edits that share one collapse into a single undo step, the way every text
  // editor treats a run of typing. Without it, a 24-character row label eats
  // 24 of HISTORY_LIMIT's 50 entries and two renames evict a whole ranking
  // session — and the Ctrl+Z handler below deliberately declines to act inside
  // an input, so the only way back would be the Undo button, one character per
  // click.
  //
  // `base` is what makes this safe inside a state updater. React invokes
  // updaters twice under StrictMode (and may re-run them when a render is
  // discarded), so a naive `lastEdit.current = key` would see its own write on
  // the second pass and coalesce an edit it had just recorded, losing the
  // entry. Holding the history the entry was recorded *into* makes the second
  // pass recognisable — it arrives with that very same object — so it takes
  // the same branch and produces the same result.
  const lastEdit = useRef<{ key: string; base: History<TierBoard> } | null>(null);

  const stepHistory = useCallback((step: (current: History<TierBoard>) => History<TierBoard>) => {
    // Undo and redo end the run of typing: coalescing a later keystroke into
    // an entry the user has just stepped away from would rewrite the present
    // without clearing the future, leaving a redo pointing at a state that no
    // longer follows from it.
    lastEdit.current = null;
    setHistory(step);
  }, []);

  const dispatch = useCallback((action: BoardAction) => {
    // A real edit — even to the freshly-created default board, before any
    // restore has resolved — always wins: over a slow board restore, which
    // would otherwise clobber the edit and discard its undo stack via
    // initHistory, and over the "nothing to save yet" guard on the debounced
    // save below (`boardReady`), so the edit is not silently dropped.
    restoreCancelled.current = true;
    boardReady.current = true;
    setHistory((current) => {
      const next = boardReducer(current.present, action);
      // An action that changed nothing must not become an undo step, or the
      // next Ctrl+Z appears to do nothing at all. Every reducer branch returns
      // the board it was given when it changes nothing, so this reference
      // check covers a move that lands where the film already was, a rename to
      // the same text, a re-clear of an empty board and a row "moved" to its
      // own index — not just the unknown-id early returns it used to catch.
      if (next === current.present) return current;

      const key = coalesceKey(action);
      if (key !== null && lastEdit.current?.key === key && lastEdit.current.base !== current) {
        // Still typing in the same field: replace the present instead of
        // pushing another entry. The future is already empty — the entry this
        // continues cleared it when it was recorded.
        return { ...current, present: next };
      }

      lastEdit.current = key === null ? null : { key, base: current };
      return record(current, next);
    });
  }, []);

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

  // Guards the debounced board save further down. Without it, the very
  // first save (400ms after mount) can fire before `loadFirstBoard()` below
  // has had a chance to resolve, writing the fresh, empty default board over
  // whatever was actually saved last time — the read simply hasn't caught up
  // yet. Settled by the board restore, whichever way it goes (found a board
  // or not, there is nothing left here for a save to clobber), and by
  // `dispatch` the instant the user makes a real edit. `performReset` flips
  // it back to false, since the fresh board it creates must not be
  // autosaved on the very next tick — that would recreate a board record
  // the confirmation dialog just promised was gone for good.
  const boardReady = useRef(false);

  useEffect(() => {
    loadFilters()
      .then((restored) => {
        // Mirrors the library restore's own guard: a user who has already
        // imported or reset wins over a filters restore that is merely slow,
        // not the other way around.
        if (restored && !restoreCancelled.current) setCriteria(restored);
      })
      .catch((error: unknown) => {
        // A lost preference costs a click. Letting it propagate would cost the page.
        console.error('Failed to restore the saved filters', error);
      });
  }, []);

  useEffect(() => {
    loadFirstBoard()
      .then((restored) => {
        if (restored && !restoreCancelled.current) setHistory(initHistory(restored));
      })
      .catch((error: unknown) => {
        console.error('Failed to restore the saved board', error);
      })
      .finally(() => {
        // Settled either way — found a board, found nothing, or failed —
        // there is nothing left for the debounced save to race against.
        boardReady.current = true;
      });
  }, []);

  useEffect(() => {
    // Dragging produces a burst of moves; one transaction per frame of that
    // burst would be pointless work.
    const id = setTimeout(() => {
      // Before the restore above has settled, `boardValue` is still the
      // fresh default board created at mount — saving it here would race
      // the restore, and if this timer wins, overwrite the real saved board
      // with an empty one. See `boardReady`.
      if (!boardReady.current) return;
      saveBoard(boardValue).catch((error: unknown) => {
        console.error('Failed to save the board', error);
      });
    }, 400);
    return () => {
      clearTimeout(id);
    };
  }, [boardValue]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      // A text field owns its own undo stack; stealing Ctrl+Z from a row's
      // label input would be worse than not offering it.
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select')) return;
      event.preventDefault();
      stepHistory((current) => (event.shiftKey ? redo(current) : undo(current)));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [stepHistory]);

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
    // `fillInDetails` is sometimes resumed by a continuation that outlives the
    // run it belongs to — App.tsx:149 awaits saveLibrary before calling this,
    // without re-checking runId, so a reset() (or another import) landing
    // inside that wait leaves this call running for an id nobody is
    // interested in any more. Without this guard it would still start a full
    // TMDB details pass in the background for a library nobody will see, and
    // its own setFetchingDetails below would re-arm the rail's disabled state
    // right after reset() had just cleared it.
    if (runId.current !== id) return;

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
        // Given its own catch, separate from the one below: a failure here is
        // "the details pass on a restored library failed", not "the restore
        // itself failed" — the library still restored fine.
        fillInDetails(restored, id).catch((error: unknown) => {
          console.error('Failed to fetch details for the restored library', error);
        });
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
      setWarnings(outcome.warnings);
      setSkipped(outcome.skipped);
      setEnriching({ done: 0, total: outcome.films.length });
      // A prior run's details pass (the restore's, or an earlier import's) may
      // still be abandoned mid-flight when this one starts: runId has just
      // moved on, so its own progress callback and finishing block are about
      // to start no-op'ing, but neither of those ever *clears* fetchingDetails,
      // and fillInDetails's own total === 0 early return doesn't either. This
      // is a real, reachable bug, not merely a defensive habit: onImported is
      // reached from DropZone's `handle`, an async continuation that outlives
      // the screen that started it and carries no staleness check of its own
      // (only onImported and reset() ever set restoreCancelled) — so a slow
      // restore can finish, start its own pass, and still be running when a
      // pending import's `onImported` finally fires with no reset() in
      // between at all. Cleared here, unconditionally, so this run starts
      // from a known-clean state rather than inheriting whatever the
      // abandoned run last wrote. (fillInDetails also guards its own
      // unconditional writes against a stale id now, for the second path this
      // same bug has: a reset() landing inside this function's own later
      // `await saveLibrary` below can clear fetchingDetails only for the
      // *stale* run's continuation to re-arm it afterwards.)
      setFetchingDetails(null);

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

  const poolFilms = useMemo(() => {
    const pooled = poolFor(boardValue, visible);
    const needle = poolSearch.trim().toLowerCase();
    return needle === ''
      ? pooled
      : pooled.filter((film) => film.title.toLowerCase().includes(needle));
  }, [boardValue, visible, poolSearch]);

  function performReset() {
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
    clearBoards().catch((error: unknown) => {
      console.error('Failed to clear the saved board', error);
    });
    boardReady.current = false;
    // The fresh board has no entry for a later keystroke to coalesce into, so
    // leaving a stale key here would swallow the first rename after a reset.
    lastEdit.current = null;
    setHistory(initHistory(createBoard('board-1', 'My ranking')));
    setPoolSearch('');
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
            onReset={() => {
              setConfirmingReset(true);
            }}
          />

          {confirmingReset && (
            <ResetConfirm
              filmCount={films.length}
              boardName={boardValue.name}
              placedCount={Object.values(boardValue.placements).flat().length}
              onConfirm={() => {
                setConfirmingReset(false);
                performReset();
              }}
              onCancel={() => {
                setConfirmingReset(false);
              }}
            />
          )}

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
              {/* Always mounted — see FilterStatus's own comment on its live
                  region: unmounting it at exactly the moment results drop to
                  zero would silence the one announcement it exists to make.
                  Its own "Clear all filters" button is suppressed instead,
                  since NoResults renders an equivalent one of its own while
                  results are zero — the two must never coexist under the
                  same accessible name, but the live region must never stop
                  existing. */}
              <FilterStatus
                films={films}
                visible={visible}
                criteria={criteria}
                onChange={updateCriteria}
                showClearAll={!filtered}
              />
              {filtered ? (
                <NoResults films={films} criteria={criteria} onChange={updateCriteria} />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        stepHistory(undo);
                      }}
                      disabled={!canUndo(history)}
                      className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent disabled:opacity-40"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stepHistory(redo);
                      }}
                      disabled={!canRedo(history)}
                      className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent disabled:opacity-40"
                    >
                      Redo
                    </button>
                  </div>

                  <PrefillPanel board={boardValue} films={films} dispatch={dispatch} />

                  <BoardScreen
                    board={boardValue}
                    films={films}
                    poolFilms={poolFilms}
                    search={poolSearch}
                    onSearchChange={setPoolSearch}
                    dispatch={dispatch}
                  />
                </div>
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
