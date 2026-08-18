import { describe, it, expect } from 'vitest';
import { DEFAULT_TIERS, createEmptyBoard, autoFillBoard, moveFilm } from '@/domain/tiers';
import type { Film } from '@/domain/film';

function film(id: string, rating: number | null): Film {
  return {
    id,
    imdbId: null,
    tmdbId: null,
    title: id,
    year: 2000,
    rating,
    ratingScale: 'imdb10',
    watchedAt: null,
    watchedAtIsApproximate: false,
    isRewatch: false,
    genres: [],
    directors: [],
    runtimeMinutes: null,
    publicRating: null,
    posterPath: null,
    source: 'imdb',
  };
}

const films = [
  film('a', 95),
  film('b', 85),
  film('c', 75),
  film('d', 65),
  film('e', 55),
  film('f', 30),
  film('g', null),
];

describe('createEmptyBoard', () => {
  it('puts every film in the pool and none in a tier', () => {
    const board = createEmptyBoard(films);
    expect(board.pool).toHaveLength(7);
    expect(Object.values(board.placements).flat()).toHaveLength(0);
  });

  it('creates one placement bucket per tier', () => {
    const board = createEmptyBoard(films);
    expect(Object.keys(board.placements).sort()).toEqual(DEFAULT_TIERS.map((t) => t.id).sort());
  });
});

describe('autoFillBoard', () => {
  it('assigns each rated film to the tier its rating falls into', () => {
    const board = autoFillBoard(films);
    expect(board.placements['S']).toEqual(['a']);
    expect(board.placements['A']).toEqual(['b']);
    expect(board.placements['B']).toEqual(['c']);
    expect(board.placements['C']).toEqual(['d']);
    expect(board.placements['D']).toEqual(['e']);
    expect(board.placements['F']).toEqual(['f']);
  });

  it('leaves unrated films in the pool rather than guessing', () => {
    expect(autoFillBoard(films).pool).toEqual(['g']);
  });

  it('orders films within a tier by rating, highest first', () => {
    const board = autoFillBoard([film('low', 91), film('high', 99)]);
    expect(board.placements['S']).toEqual(['high', 'low']);
  });

  it('honours custom tier thresholds', () => {
    const tiers = [
      { id: 'good', label: 'Good', color: '#0f0', minRating: 60 },
      { id: 'bad', label: 'Bad', color: '#f00', minRating: null },
    ];
    const board = autoFillBoard(films, tiers);
    expect(board.placements['good']).toEqual(['a', 'b', 'c', 'd']);
    expect(board.placements['bad']).toEqual(['e', 'f']);
  });
});

describe('moveFilm', () => {
  it('moves a film from the pool into a tier at the requested position', () => {
    const board = moveFilm(createEmptyBoard(films), 'c', 'S', 0);
    expect(board.placements['S']).toEqual(['c']);
    expect(board.pool).not.toContain('c');
  });

  it('moves a film between tiers', () => {
    const board = moveFilm(autoFillBoard(films), 'f', 'S', 0);
    expect(board.placements['S']).toEqual(['f', 'a']);
    expect(board.placements['F']).toEqual([]);
  });

  it('reorders a film within its own tier', () => {
    const filled = autoFillBoard([film('x', 99), film('y', 95), film('z', 92)]);
    const board = moveFilm(filled, 'z', 'S', 0);
    expect(board.placements['S']).toEqual(['z', 'x', 'y']);
  });

  it('sends a film back to the pool when the target tier is null', () => {
    const board = moveFilm(autoFillBoard(films), 'a', null, 0);
    expect(board.pool[0]).toBe('a');
    expect(board.placements['S']).toEqual([]);
  });

  it('does not mutate the board it was given', () => {
    const original = autoFillBoard(films);
    const snapshot = JSON.stringify(original);
    moveFilm(original, 'a', 'F', 0);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('ignores a film id that is not on the board', () => {
    const board = autoFillBoard(films);
    expect(moveFilm(board, 'not-a-real-id', 'S', 0)).toBe(board);
  });

  it('ignores a tier id that does not exist', () => {
    const board = autoFillBoard(films);
    expect(moveFilm(board, 'a', 'NOPE', 0)).toBe(board);
  });
});
