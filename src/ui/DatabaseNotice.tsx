import { useSyncExternalStore } from 'react';
import { databaseStall, watchDatabaseStall } from '@/services/db';

/**
 * The one database failure that produces no error to show.
 *
 * A blocked upgrade leaves openDB's promise unsettled — not rejected, unsettled
 * — so every read hangs, `films` never leaves null, and the import screen is
 * what the user is left looking at. That is indistinguishable from a library
 * that vanished, and it is not: the data is on disk, and closing the other tab
 * brings it straight back. Nothing but this said so.
 *
 * It clears itself. The stall is reported when the upgrade is blocked and
 * withdrawn when it goes through, so closing the other tab takes this away
 * without a reload.
 */
export function DatabaseNotice() {
  const stall = useSyncExternalStore(watchDatabaseStall, databaseStall);
  if (stall === null) return null;

  const [heading, detail] =
    stall.reason === 'blocked'
      ? [
          'Waiting for another tab',
          'Cinetier is open in another tab on an older version, which is holding the database open. Nothing has been lost. Close or reload that tab and this one carries on by itself.',
        ]
      : [
          'This page is out of date',
          'What is saved here was written by a newer version of Cinetier than the one this tab is running. Nothing has been lost, and rather than risk reading it wrongly it has been left alone. Reload the page to pick up the newer version.',
        ];

  return (
    <div
      role="status"
      className="mx-auto max-w-3xl rounded-card border border-danger bg-surface-raised px-4 py-3 text-sm text-ink"
    >
      <p className="font-display tracking-wide uppercase">{heading}</p>
      <p className="mt-1 text-ink-dim">{detail}</p>
    </div>
  );
}
