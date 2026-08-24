import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getCached, putCached, CACHE_TTL_MS } from '@/services/tmdbCache';
import { resetDatabase } from '@/services/db';

beforeEach(async () => {
  await resetDatabase();
});

describe('tmdbCache', () => {
  it('reports a key it has never seen as unknown, not as absent', async () => {
    expect(await getCached('imdb:tt0133093')).toBeUndefined();
  });

  it('round-trips a match', async () => {
    const match = { tmdbId: 603, imdbId: 'tt0133093', posterPath: '/m.jpg', publicRating: 82 };
    await putCached('imdb:tt0133093', match);
    expect(await getCached('imdb:tt0133093')).toEqual(match);
  });

  it('remembers that a lookup found nothing, so it is not repeated', async () => {
    await putCached('imdb:tt9999999', null);
    expect(await getCached('imdb:tt9999999')).toBeNull();
  });

  it('ignores an entry older than the time to live', async () => {
    const match = { tmdbId: 1, imdbId: null, posterPath: null, publicRating: null };
    await putCached('title:old', match, Date.now() - CACHE_TTL_MS - 1);
    expect(await getCached('title:old')).toBeUndefined();
  });
});
