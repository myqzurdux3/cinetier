import { describe, it, expect } from 'vitest';
import {
  layoutBoard,
  cardsPerLine,
  rowHeight,
  fitCardWidth,
  DEFAULT_LAYOUT,
  CARD_ASPECT_RATIO,
  type LayoutOptions,
} from '@/domain/boardLayout';
import { createBoard, moveFilm, type TierBoard } from '@/domain/tiers';
import type { Film } from '@/domain/film';

function film(id: string, overrides: Partial<Film> = {}): Film {
  return {
    id,
    imdbId: null,
    tmdbId: null,
    title: id,
    year: 2000,
    titleType: 'movie',
    rating: 80,
    ratingScale: 'imdb10',
    watchedAt: null,
    watchedAtIsApproximate: false,
    isRewatch: false,
    genres: [],
    directors: [],
    runtimeMinutes: null,
    publicRating: null,
    posterPath: null,
    detailsFetched: false,
    source: 'imdb',
    ...overrides,
  };
}

/** `count` films placed in tier `tierId`, in order. */
function boardWith(tierId: string, count: number): { board: TierBoard; films: Film[] } {
  const films = Array.from({ length: count }, (_, i) => film(`f${String(i)}`));
  let board = createBoard('b', 'My ranking');
  films.forEach((f, index) => {
    board = moveFilm(board, f.id, { tierId, index });
  });
  return { board, films };
}

// Deliberately round numbers, so an assertion below reads as arithmetic rather
// than as a value copied out of a failure message.
const OPTIONS: LayoutOptions = {
  cardWidth: 100,
  gap: 10,
  padding: 20,
  labelWidth: 100,
  headerHeight: 50,
  width: 1000,
};

describe('cardsPerLine', () => {
  it('divides what is left after the padding, the label and its gap', () => {
    // 1000 - 40 - 100 - 10 = 850 of usable width; a card plus its trailing gap
    // is 110, and the last card needs no trailing gap: floor(860 / 110) = 7.
    expect(cardsPerLine(OPTIONS)).toBe(7);
  });

  it('does not reserve a trailing gap for the last card on a line', () => {
    // 1020 - 40 - 100 - 10 leaves exactly 870, which is eight cards and the
    // seven gaps between them. Counting a gap after the eighth as well would
    // answer 7 and leave a card-shaped hole at the end of every line.
    expect(cardsPerLine({ ...OPTIONS, width: 1020 })).toBe(8);
  });

  it('never reports fewer than one', () => {
    // A row narrower than a single card would otherwise divide the cards into
    // lines of length zero, and laying out one film would never terminate.
    expect(cardsPerLine({ ...OPTIONS, width: 10 })).toBe(1);
  });
});

describe('rowHeight', () => {
  it('gives an empty row the height of one line', () => {
    expect(rowHeight(0, OPTIONS)).toBe(100 * CARD_ASPECT_RATIO + OPTIONS.padding);
  });

  it('gives a full line and a one-card line the same height as two lines', () => {
    const two = 2 * 100 * CARD_ASPECT_RATIO + OPTIONS.gap + OPTIONS.padding;
    expect(rowHeight(8, OPTIONS)).toBe(two);
    expect(rowHeight(14, OPTIONS)).toBe(two);
  });

  it('grows by one line at each multiple of the line length', () => {
    expect(rowHeight(7, OPTIONS)).toBeLessThan(rowHeight(8, OPTIONS));
    expect(rowHeight(14, OPTIONS)).toBeLessThan(rowHeight(15, OPTIONS));
  });
});

describe('layoutBoard', () => {
  it('lays a row out left to right and wraps at the line length', () => {
    const { board, films } = boardWith('B', 9);
    const row = layoutBoard(board, films, OPTIONS).rows.find((r) => r.tierId === 'B');

    const xs = row!.cards.map((card) => card.x);
    expect(xs.slice(0, 7)).toEqual([130, 240, 350, 460, 570, 680, 790]);
    // The eighth card starts a second line: back to the first column, one card
    // height and one gap further down.
    expect(xs[7]).toBe(130);
    expect(row!.cards[7]!.y - row!.cards[0]!.y).toBe(100 * CARD_ASPECT_RATIO + OPTIONS.gap);
  });

  it('stacks rows in the board order, below the header', () => {
    const { board, films } = boardWith('A', 3);
    const layout = layoutBoard(board, films, OPTIONS);

    expect(layout.rows.map((row) => row.tierId)).toEqual(board.tiers.map((tier) => tier.id));
    expect(layout.rows[0]!.y).toBe(OPTIONS.headerHeight);
    for (let i = 1; i < layout.rows.length; i += 1) {
      expect(layout.rows[i]!.y).toBe(
        layout.rows[i - 1]!.y + layout.rows[i - 1]!.height + OPTIONS.gap,
      );
    }
  });

  it('is tall enough for its last row', () => {
    const { board, films } = boardWith('F', 20);
    const layout = layoutBoard(board, films, OPTIONS);
    const last = layout.rows.at(-1)!;
    expect(layout.height).toBeGreaterThanOrEqual(last.y + last.height);
    // And no taller than one margin past it: the trailing gap between rows
    // plus the padding, so the bottom edge matches the top and the sides.
    expect(layout.height - (last.y + last.height)).toBe(OPTIONS.gap + OPTIONS.padding);
  });

  it('carries the title and poster of each placed film', () => {
    const films = [
      film('a', { title: 'Heat', posterPath: '/heat.jpg' }),
      film('b', { title: 'Ronin' }),
    ];
    const board = moveFilm(createBoard('b', 'x'), 'a', { tierId: 'S', index: 0 });
    const layout = layoutBoard(board, films, OPTIONS);
    const card = layout.rows.find((row) => row.tierId === 'S')!.cards[0];

    expect(card).toMatchObject({ filmId: 'a', title: 'Heat', posterPath: '/heat.jpg' });
  });

  it('skips a placed id with no film behind it', () => {
    // The board is restored before the library is, so for a moment every
    // placement points at nothing. Drawing those as gaps would put holes in
    // the picture; they are left out entirely, as the board itself does.
    const board = moveFilm(createBoard('b', 'x'), 'missing', { tierId: 'S', index: 0 });
    const layout = layoutBoard(board, [], OPTIONS);

    expect(layout.rows.find((row) => row.tierId === 'S')!.cards).toEqual([]);
  });

  it('keeps every card inside the image', () => {
    const { board, films } = boardWith('C', 30);
    const layout = layoutBoard(board, films, OPTIONS);
    for (const card of layout.rows.flatMap((row) => row.cards)) {
      expect(card.x).toBeGreaterThanOrEqual(OPTIONS.padding);
      expect(card.x + card.width).toBeLessThanOrEqual(layout.width - OPTIONS.padding);
      expect(card.y + card.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it('carries the board name, for the header to draw', () => {
    const { board, films } = boardWith('S', 1);
    expect(layoutBoard(board, films, OPTIONS).name).toBe('My ranking');
  });
});

describe('fitCardWidth', () => {
  it('leaves the default alone when the board already fits', () => {
    const { board, films } = boardWith('S', 4);
    expect(fitCardWidth(board, films, 10_000)).toBe(DEFAULT_LAYOUT.cardWidth);
  });

  it('shrinks the cards until the board fits the height it is given', () => {
    const { board, films } = boardWith('S', 800);
    const width = fitCardWidth(board, films, 8000);

    expect(width).toBeLessThan(DEFAULT_LAYOUT.cardWidth);
    expect(
      layoutBoard(board, films, { ...DEFAULT_LAYOUT, cardWidth: width }).height,
    ).toBeLessThanOrEqual(8000);
  });

  it('stops shrinking at the floor rather than producing an unreadable image', () => {
    const { board, films } = boardWith('S', 5000);
    // Far too small for that many films at any legible size; the answer is the
    // floor, not a one-pixel poster and not an endless loop.
    expect(fitCardWidth(board, films, 500)).toBe(24);
  });
});
