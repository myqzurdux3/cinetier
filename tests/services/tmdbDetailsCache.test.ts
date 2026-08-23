import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  getCachedDetails,
  putCachedDetails,
  DETAILS_CACHE_TTL_MS,
} from '@/services/tmdbDetailsCache';
import { resetDatabase } from '@/services/db';

beforeEach(async () => {
  await resetDatabase();
});

describe('the details cache', () => {
  it('reports undefined for a title nobody has looked up', async () => {
    expect(await getCachedDetails('movie:949')).toBeUndefined();
  });

  it('round-trips a set of details', async () => {
    const details = { genres: ['Drama'], runtimeMinutes: 170, directors: ['Michael Mann'] };
    await putCachedDetails('movie:949', details);
    expect(await getCachedDetails('movie:949')).toEqual(details);
  });

  it('distinguishes "TMDB had nothing" from "never asked"', async () => {
    await putCachedDetails('movie:1', null);
    expect(await getCachedDetails('movie:1')).toBeNull();
  });

  it('forgets an entry older than the time to live', async () => {
    await putCachedDetails(
      'movie:949',
      { genres: [], runtimeMinutes: null, directors: [] },
      Date.now() - DETAILS_CACHE_TTL_MS - 1,
    );
    expect(await getCachedDetails('movie:949')).toBeUndefined();
  });
});
