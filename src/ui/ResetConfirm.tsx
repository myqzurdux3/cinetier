interface ResetConfirmProps {
  filmCount: number;
  boardName: string | null;
  placedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "Start over" claims to start over, so it takes the boards with it. That makes
 * it the most destructive control in the app, and a generic "are you sure?" is
 * what lets someone answer it by reflex. This one names the numbers.
 */
export function ResetConfirm({
  filmCount,
  boardName,
  placedCount,
  onConfirm,
  onCancel,
}: ResetConfirmProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start over"
      className="space-y-3 rounded-card border border-line p-4"
    >
      <p className="text-ink">This deletes, from this browser:</p>
      <ul className="list-disc space-y-1 pl-6 text-sm text-ink-dim">
        <li>{`your library of ${String(filmCount)} films`}</li>
        <li>your saved filters</li>
        {boardName !== null && (
          <li>{`your board “${boardName}”, with ${String(placedCount)} placed films`}</li>
        )}
      </ul>
      <p className="text-sm text-ink-dim">Nothing here can be recovered afterwards.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-card border border-line px-3 py-2 text-sm text-ink focus:ring-2 focus:ring-accent"
        >
          Keep everything
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent"
        >
          Delete everything and start over
        </button>
      </div>
    </div>
  );
}
