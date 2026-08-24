import { describe, it, expect } from 'vitest';
import { initHistory, record, undo, redo, canUndo, canRedo, HISTORY_LIMIT } from '@/domain/history';

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const history = initHistory('a');
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('undo returns the previous state and redo returns the undone one', () => {
    let history = record(initHistory('a'), 'b');
    expect(canUndo(history)).toBe(true);
    history = record(history, 'c');

    history = undo(history);
    expect(history.present).toBe('b');
    history = undo(history);
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);

    history = redo(history);
    expect(history.present).toBe('b');
    history = redo(history);
    expect(history.present).toBe('c');
    expect(canRedo(history)).toBe(false);
  });

  it('discards the future when a new state is recorded after an undo', () => {
    // Branching histories are the other way to do this, and they surprise
    // people: redo after an unrelated edit restores something they did not
    // expect. Discarding is what every editor does.
    let history = record(record(initHistory('a'), 'b'), 'c');
    history = undo(history);
    expect(canRedo(history)).toBe(true);

    history = record(history, 'd');
    expect(canRedo(history)).toBe(false);
    expect(history.present).toBe('d');
    expect(undo(history).present).toBe('b');
  });

  it('undo at the beginning and redo at the end are no-ops', () => {
    const history = initHistory('a');
    // Reference equality matters, not just value equality: Task 11 calls
    // setHistory(undo) straight from React state, and returning the same
    // object is what lets React bail out of re-rendering at the boundary.
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it('forgets the oldest state past the limit', () => {
    let history = initHistory(0);
    for (let n = 1; n <= HISTORY_LIMIT + 5; n += 1) history = record(history, n);

    expect(history.past).toHaveLength(HISTORY_LIMIT);
    // The oldest survivor is the (limit)th-from-last, not the original 0.
    expect(history.past[0]).toBe(HISTORY_LIMIT + 5 - HISTORY_LIMIT);
  });

  it('never mutates the history it was given', () => {
    const history = record(initHistory('a'), 'b');
    const before = {
      past: [...history.past],
      present: history.present,
      future: [...history.future],
    };
    undo(history);
    record(history, 'c');
    expect(history).toEqual(before);
  });
});
