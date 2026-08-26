import { useId } from 'react';
import type { TierBoard } from '@/domain/tiers';

interface BoardBarProps {
  /** Every saved board, plus the one on screen if it has never been saved. */
  boards: TierBoard[];
  current: TierBoard;
  onSwitch: (id: string) => void;
  onRename: (name: string) => void;
  onCreate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSaveFile: () => void;
  /**
   * Whether the four board-set actions are showing on a narrow screen. Above
   * `sm` they always are; below it they are folded away behind App's "Board
   * tools" toggle, because a phone showed seven hundred pixels of controls
   * before the first row of the tier list.
   */
  actionsOpen: boolean;
}

const BUTTON =
  'rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent disabled:opacity-40';

/**
 * Which tier list you are looking at, and what to do with the set of them.
 *
 * The name is an input rather than a label beside the picker: it is the title
 * of the exported image and the stem of its file name, so it is worth being
 * able to change without hunting for a mode. The picker shows the same name,
 * and follows it as you type.
 */
export function BoardBar({
  boards,
  current,
  onSwitch,
  onRename,
  onCreate,
  onDuplicate,
  onDelete,
  onSaveFile,
  actionsOpen,
}: BoardBarProps) {
  const nameId = useId();
  const pickerId = useId();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={nameId} className="text-sm text-ink-dim">
        Board name
      </label>
      <input
        id={nameId}
        value={current.name}
        maxLength={60}
        onChange={(event) => {
          onRename(event.target.value);
        }}
        className="w-48 rounded-card border border-line bg-surface px-2 py-1 text-sm text-ink focus:ring-2 focus:ring-accent"
      />

      {/*
        Hidden while it would offer one choice. A picker that cannot pick is
        furniture, and this row is above the board on every screen.
      */}
      {boards.length > 1 && (
        <>
          <label htmlFor={pickerId} className="sr-only">
            Switch board
          </label>
          <select
            id={pickerId}
            value={current.id}
            onChange={(event) => {
              onSwitch(event.target.value);
            }}
            className="rounded-card border border-line bg-surface px-2 py-1 text-sm text-ink focus:ring-2 focus:ring-accent"
          >
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </>
      )}

      {/*
        `contents` rather than a block: the wrapper exists only to hide the
        four buttons together below `sm`, and any other display value would
        take them out of the row's wrapping and stack them on their own line
        on every wider screen.
      */}
      <div className={`${actionsOpen ? 'contents' : 'hidden'} sm:contents`}>
        <button type="button" className={BUTTON} onClick={onCreate}>
          New board
        </button>
        <button type="button" className={BUTTON} onClick={onSaveFile}>
          Save as a file
        </button>
        <button type="button" className={BUTTON} onClick={onDuplicate}>
          Duplicate
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={onDelete}
          disabled={boards.length <= 1}
          // Disabled rather than absent at one board: the control keeps its
          // place in the row, and its disabled state says "there is nothing to
          // delete this to" more clearly than a button that comes and goes.
        >
          Delete board
        </button>
      </div>
    </div>
  );
}
