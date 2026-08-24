import { db } from './db';
import { activeCriteria, type FilterCriteria } from '@/domain/filters';

const KEY = 'current';

export async function saveFilters(criteria: FilterCriteria): Promise<void> {
  await (await db()).put('filters', { criteria, savedAt: Date.now() }, KEY);
}

/**
 * IndexedDB stores structured clones, so a Date written here comes back a Date
 * and this normally hands the value straight through. It exists for what the
 * clone cannot promise: a criteria object that reached the store some other way
 * — a JSON import, an older build — where a date is a string. Such a string
 * passes every check the filter predicates make and then compares as text.
 */
function reviveDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

export async function loadFilters(): Promise<FilterCriteria | null> {
  const entry = await (await db()).get('filters', KEY);
  if (!entry) return null;

  const stored: FilterCriteria = { ...entry.criteria };
  for (const key of ['watchedAfter', 'watchedBefore'] as const) {
    if (stored[key] === undefined) continue;
    const revived = reviveDate(stored[key]);
    if (revived) stored[key] = revived;
    else delete stored[key];
  }

  // An empty criteria object is not a filtered view that happens to admit
  // everything; it is no filter, and restoring it as one is the same mistake
  // that made an empty saved library restore as a library.
  return activeCriteria(stored).length > 0 ? stored : null;
}

export async function clearFilters(): Promise<void> {
  await (await db()).delete('filters', KEY);
}
