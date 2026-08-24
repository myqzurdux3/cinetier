import { describe, it, expect, vi } from 'vitest';
import type { Collision, CollisionDetection } from '@dnd-kit/core';
import { preferPointer, POOL_ID } from '@/ui/board/collision';

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

  it('answers with the pool alone when the pointer is inside it', () => {
    // The pool is pinned to the bottom of the viewport and painted over
    // whatever row is behind it, so its rectangle overlaps that row's.
    // pointerWithin returns both and orders them by distance to each
    // rectangle's centre, which a tall row wins — the film then lands in a row
    // the pointer was never over.
    const hits = [hit('tier:f'), hit(POOL_ID), hit('imdb:tt1')];
    expect(preferPointer(stub(hits), stub([hit('nearest')]))(ARGS)).toEqual([hit(POOL_ID)]);
  });

  it('leaves the order alone when the pool is not among the hits', () => {
    const hits = [hit('imdb:tt1'), hit('tier:f')];
    expect(preferPointer(stub(hits), stub([hit('nearest')]))(ARGS)).toEqual(hits);
  });

  it('reports nothing when neither strategy finds anything', () => {
    // A pointer outside every droppable must stay a no-op drop, not become a
    // move to whatever was returned last.
    expect(preferPointer(stub([]), stub([]))(ARGS)).toEqual([]);
  });
});
