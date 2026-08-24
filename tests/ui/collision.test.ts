import { describe, it, expect, vi } from 'vitest';
import type { Collision, CollisionDetection } from '@dnd-kit/core';
import { preferPointer } from '@/ui/board/collision';

// The real strategies need laid-out rects, which jsdom does not have. What is
// worth pinning here is the composition rule, and specifically the fallback:
// pointerWithin returns nothing for a keyboard drag, and a board that stopped
// choosing a destination under the arrow keys is the failure this guards.
const hit = (id: string): Collision => ({ id });
const stub = (result: Collision[]): CollisionDetection => vi.fn(() => result);

// The stubs above ignore their argument entirely, so an empty object stands in
// for the fully laid-out one dnd-kit would pass.
const ARGS = {} as unknown as Parameters<CollisionDetection>[0];

describe('preferPointer', () => {
  it('answers with the pointer strategy when it finds something', () => {
    expect(preferPointer(stub([hit('under-pointer')]), stub([hit('nearest')]))(ARGS)).toEqual([
      hit('under-pointer'),
    ]);
  });

  it('falls back when the pointer strategy finds nothing', () => {
    // A keyboard drag has no pointer, so this is every keyboard move.
    expect(preferPointer(stub([]), stub([hit('nearest')]))(ARGS)).toEqual([hit('nearest')]);
  });

  it('does not consult the fallback when the pointer strategy answered', () => {
    // Not a performance point: closestCenter would return a *different*
    // droppable, and merging the two lists would put it in the running.
    const fallback = stub([hit('nearest')]);
    preferPointer(stub([hit('under-pointer')]), fallback)(ARGS);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('reports nothing when neither strategy finds anything', () => {
    // A pointer outside every droppable must stay a no-op drop, not become a
    // move to whatever was returned last.
    expect(preferPointer(stub([]), stub([]))(ARGS)).toEqual([]);
  });
});
