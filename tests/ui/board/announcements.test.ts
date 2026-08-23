import { describe, it, expect } from 'vitest';
import { boardAnnouncements } from '@/ui/board/announcements';

const describeItem = (id: string) => {
  if (id === 'heat') return { title: 'Heat', where: 'the pool' };
  if (id === 'dune') return { title: 'Dune', where: 'tier A, position 2 of 3' };
  return null;
};

const announce = boardAnnouncements(describeItem);

describe('boardAnnouncements', () => {
  it('names the film and where it came from on lift', () => {
    expect(announce.onDragStart({ active: { id: 'heat' } })).toBe('Heat lifted from the pool.');
  });

  it('names the film and where it is hovering on move', () => {
    expect(announce.onDragOver({ active: { id: 'heat' }, over: { id: 'dune' } })).toBe(
      'Heat is over tier A, position 2 of 3.',
    );
  });

  it('names where the film landed on drop', () => {
    expect(announce.onDragEnd({ active: { id: 'heat' }, over: { id: 'dune' } })).toBe(
      'Heat dropped into tier A, position 2 of 3.',
    );
  });

  it('says a drop went nowhere rather than staying silent', () => {
    // Silence after a drop is indistinguishable from a drop that worked.
    expect(announce.onDragEnd({ active: { id: 'heat' }, over: null })).toBe('Heat was not moved.');
  });

  it('says a cancelled drag was cancelled', () => {
    expect(announce.onDragCancel({ active: { id: 'heat' } })).toBe('Moving Heat was cancelled.');
  });

  it('falls back to a neutral phrase for an id it cannot describe', () => {
    // Never throws mid-drag: an unknown id is a bug, but a screen reader
    // going silent because a lookup returned null is a worse one.
    expect(announce.onDragStart({ active: { id: 'ghost' } })).toBe('Item lifted.');
  });
});
