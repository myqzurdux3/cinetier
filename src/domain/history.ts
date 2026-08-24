/**
 * Undo as a generic structure: a stack behind the present and a stack ahead of
 * it. Deliberately knows nothing about what it holds, so it can be tested by
 * pushing strings around rather than by building boards.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * How many states back undo reaches. Fifty is far more than a session's worth
 * of mistakes and small enough that the whole history is a few kilobytes of
 * string arrays.
 */
export const HISTORY_LIMIT = 50;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Record a new present. The future is discarded rather than branched: redo
 * after an unrelated edit would otherwise restore something the user has no
 * reason to expect, which is the behaviour every editor avoids.
 */
export function record<T>(history: History<T>, next: T): History<T> {
  const past = [...history.past, history.present];
  return {
    past: past.slice(Math.max(0, past.length - HISTORY_LIMIT)),
    present: next,
    future: [],
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
