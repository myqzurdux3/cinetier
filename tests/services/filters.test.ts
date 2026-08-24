import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveFilters, loadFilters, clearFilters } from '@/services/filters';
import { db, resetDatabase } from '@/services/db';
import type { FilterCriteria } from '@/domain/filters';

beforeEach(async () => {
  await resetDatabase();
});

describe('filter persistence', () => {
  it('reports nothing when nothing was ever saved', async () => {
    expect(await loadFilters()).toBeNull();
  });

  it('round-trips a set of criteria', async () => {
    const criteria: FilterCriteria = { minRating: 80, genres: ['Drama'], topN: 25 };
    await saveFilters(criteria);
    expect(await loadFilters()).toEqual(criteria);
  });

  it('restores watch dates as Date objects, not strings', async () => {
    // The filter predicates compare with < and >. A string survives every
    // typeof check on the way in and then compares as text.
    await saveFilters({ watchedAfter: new Date('2024-01-31T00:00:00Z') });
    const restored = await loadFilters();
    expect(restored!.watchedAfter).toBeInstanceOf(Date);
    expect(restored!.watchedAfter!.toISOString()).toContain('2024-01-31');
  });

  it('revives a date that was stored as a string', async () => {
    // Not something this store writes — it is what a criteria object arriving
    // from a JSON import path would look like.
    await (
      await db()
    ).put(
      'filters',
      {
        criteria: { watchedBefore: '2025-12-01T00:00:00.000Z' },
        savedAt: Date.now(),
      } as unknown as {
        criteria: FilterCriteria;
        savedAt: number;
      },
      'current',
    );
    const restored = await loadFilters();
    expect(restored!.watchedBefore).toBeInstanceOf(Date);
  });

  it('drops a date that cannot be read at all', async () => {
    await (
      await db()
    ).put(
      'filters',
      {
        criteria: { watchedBefore: 'not a date', minRating: 50 },
        savedAt: Date.now(),
      } as unknown as {
        criteria: FilterCriteria;
        savedAt: number;
      },
      'current',
    );
    const restored = await loadFilters();
    expect(restored).toEqual({ minRating: 50 });
  });

  it('restores an empty criteria object as no filter at all', async () => {
    // Saving {} and restoring it as a filtered view would show a clear-all
    // action over a library nobody has filtered.
    await saveFilters({});
    expect(await loadFilters()).toBeNull();
  });

  it('restores criteria the library can no longer satisfy, rather than editing them', async () => {
    // A genre no film carries admits nothing, and the zero-result screen
    // explains that. Silently dropping it would change what the user asked for.
    await saveFilters({ genres: ['Nonexistent'] });
    expect(await loadFilters()).toEqual({ genres: ['Nonexistent'] });
  });

  it('forgets the criteria when asked', async () => {
    await saveFilters({ minRating: 80 });
    await clearFilters();
    expect(await loadFilters()).toBeNull();
  });
});
