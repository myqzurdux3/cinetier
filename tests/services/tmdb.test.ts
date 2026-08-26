import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  lookupByImdbId,
  searchByTitle,
  posterUrl,
  fetchMovieDetails,
  fetchTvDetails,
} from '@/services/tmdb';

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

  it('encodes the identifier into the path rather than pasting it in', async () => {
    // The id comes out of a CSV the user chose. Every export seen so far
    // carries `tt` and digits, but the title beside it has always been
    // encoded and this had not been — a `?` or a `#` in that field would
    // rewrite the request rather than be part of it.
    const fetchMock = mockFetch({ movie_results: [] });

    await lookupByImdbId('tt01?x#y/z');

    const url = String(fetchMock.mock.calls[0]?.[0]);
    const [path, query = ''] = url.split('?');
    expect(path).toContain('tt01%3Fx%23y%2Fz');
    // The api_key and external_source are still the only query it carries.
    expect(query).toMatch(/^api_key=.*&external_source=imdb_id$/);
  });

  it('returns null when TMDB knows nothing about that identifier', async () => {
    mockFetch({ movie_results: [], tv_results: [] });
    expect(await lookupByImdbId('tt9999999')).toBeNull();
  });

  it('falls back to the television result, so an imported series still gets a poster', async () => {
    // TMDB files films and series in separate buckets; reading only movie_results
    // left every series in the library with no artwork.
    mockFetch({
      movie_results: [],
      tv_results: [{ id: 1396, poster_path: '/breaking-bad.jpg', vote_average: 8.9 }],
    });

    const match = await lookupByImdbId('tt0903747');

    expect(match).toEqual({
      tmdbId: 1396,
      imdbId: 'tt0903747',
      posterPath: '/breaking-bad.jpg',
      publicRating: 89,
    });
  });

  it('prefers the film when a single identifier somehow answers in both buckets', async () => {
    mockFetch({
      movie_results: [{ id: 1, poster_path: '/film.jpg', vote_average: 7 }],
      tv_results: [{ id: 2, poster_path: '/series.jpg', vote_average: 8 }],
    });
    expect((await lookupByImdbId('tt0000002'))?.tmdbId).toBe(1);
  });

  it('treats a zero vote average as no public rating rather than a rating of zero', async () => {
    mockFetch({ movie_results: [{ id: 1, poster_path: null, vote_average: 0 }] });
    const match = await lookupByImdbId('tt0000001');
    expect(match?.publicRating).toBeNull();
  });

  it('treats a vote average below 1 as no public rating rather than throwing', async () => {
    mockFetch({ movie_results: [{ id: 2, poster_path: null, vote_average: 0.5 }] });
    const match = await lookupByImdbId('tt0000002');
    expect(match).not.toBeNull();
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

describe('fetchMovieDetails', () => {
  it('reads genres, runtime, and the crew members who directed', async () => {
    mockFetch({
      genres: [
        { id: 18, name: 'Drama' },
        { id: 80, name: 'Crime' },
      ],
      runtime: 170,
      credits: {
        crew: [
          { job: 'Director', name: 'Michael Mann' },
          { job: 'Editor', name: 'Dov Hoenig' },
        ],
      },
    });

    expect(await fetchMovieDetails(949)).toEqual({
      genres: ['Drama', 'Crime'],
      runtimeMinutes: 170,
      directors: ['Michael Mann'],
    });
  });

  it('asks the movie endpoint, with credits appended', async () => {
    const fetchMock = mockFetch({ genres: [], runtime: null, credits: { crew: [] } });
    await fetchMovieDetails(949);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/movie/949');
    expect(url).toContain('append_to_response=credits');
  });

  it('reports an answer of nothing as an answer, not as a failure', async () => {
    // The difference matters: this marks the film as asked-about, and a null
    // would leave the details pass selecting it again on every visit.
    mockFetch({ genres: [], runtime: null, credits: { crew: [] } });
    expect(await fetchMovieDetails(949)).not.toBeNull();
    expect(await fetchMovieDetails(949)).toEqual({
      genres: [],
      runtimeMinutes: null,
      directors: [],
    });
  });

  it('reports null when the request fails', async () => {
    mockFetch(null, false);
    expect(await fetchMovieDetails(949)).toBeNull();
  });

  it('treats a zero runtime as no runtime', async () => {
    // TMDB reports 0 for titles nobody has filled in, and a "0 minutes or more"
    // filter bound is not a fact about the film.
    mockFetch({ genres: [], runtime: 0, credits: { crew: [] } });
    expect((await fetchMovieDetails(949))!.runtimeMinutes).toBeNull();
  });
});

describe('fetchTvDetails', () => {
  it('reads genres, episode runtime, and the creators', async () => {
    // A series has no single director. created_by is the honest equivalent, and
    // the interface shows it under the same heading.
    mockFetch({
      genres: [{ id: 18, name: 'Drama' }],
      episode_run_time: [47],
      created_by: [{ name: 'Vince Gilligan' }],
    });

    expect(await fetchTvDetails(1396)).toEqual({
      genres: ['Drama'],
      runtimeMinutes: 47,
      directors: ['Vince Gilligan'],
    });
  });

  it('asks the television endpoint', async () => {
    // Asking /movie about a series returns nothing, and nothing looks exactly
    // like a title with no genres — which is why this is pinned.
    const fetchMock = mockFetch({ genres: [], episode_run_time: [], created_by: [] });
    await fetchTvDetails(1396);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/tv/1396');
  });

  it('reports null when the request fails', async () => {
    mockFetch(null, false);
    expect(await fetchTvDetails(1396)).toBeNull();
  });
});
