import { describe, it, expect, vi, afterEach } from 'vitest';
import { lookupByImdbId, searchByTitle, posterUrl } from '@/services/tmdb';

function mockFetch(payload: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupByImdbId', () => {
  it('returns the first movie result', async () => {
    mockFetch({
      movie_results: [{ id: 603, poster_path: '/matrix.jpg', vote_average: 8.2 }],
    });

    const match = await lookupByImdbId('tt0133093');

    expect(match).toEqual({
      tmdbId: 603,
      imdbId: 'tt0133093',
      posterPath: '/matrix.jpg',
      publicRating: 82,
    });
  });

  it('returns null when TMDB knows nothing about that identifier', async () => {
    mockFetch({ movie_results: [] });
    expect(await lookupByImdbId('tt9999999')).toBeNull();
  });

  it('treats a zero vote average as no public rating rather than a rating of zero', async () => {
    mockFetch({ movie_results: [{ id: 1, poster_path: null, vote_average: 0 }] });
    const match = await lookupByImdbId('tt0000001');
    expect(match?.publicRating).toBeNull();
  });

  it('returns null rather than throwing when TMDB fails', async () => {
    mockFetch({}, false);
    expect(await lookupByImdbId('tt0133093')).toBeNull();
  });

  it('sends the identifier but never anything about the user', async () => {
    const fetchMock = mockFetch({ movie_results: [] });
    await lookupByImdbId('tt0133093');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('tt0133093');
    expect(url).toContain('external_source=imdb_id');
  });
});

describe('searchByTitle', () => {
  it('constrains the search by year when one is known', async () => {
    const fetchMock = mockFetch({
      results: [{ id: 438631, poster_path: '/dune.jpg', vote_average: 7.8 }],
    });
    const match = await searchByTitle('Dune', 2021);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('year=2021');
    expect(match).toMatchObject({ tmdbId: 438631, publicRating: 78 });
  });

  it('omits the year when the export did not carry one', async () => {
    const fetchMock = mockFetch({ results: [] });
    await searchByTitle('Dune', null);
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('year=');
  });
});

describe('posterUrl', () => {
  it('builds a TMDB image URL at the requested size', () => {
    expect(posterUrl('/matrix.jpg')).toBe('https://image.tmdb.org/t/p/w342/matrix.jpg');
    expect(posterUrl('/matrix.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/matrix.jpg');
  });
});
