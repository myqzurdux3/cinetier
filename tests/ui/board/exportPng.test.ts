import { describe, it, expect, vi } from 'vitest';
import {
  fitText,
  pngFilename,
  paint,
  posterUrl,
  readPalette,
  loadPosters,
  type Painter,
  type Palette,
} from '@/ui/board/exportPng';
import { layoutBoard, DEFAULT_LAYOUT } from '@/domain/boardLayout';
import { createBoard, moveFilm } from '@/domain/tiers';
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

/**
 * A painter that records instead of drawing. jsdom has no 2D context at all,
 * and the questions worth asking of this module — is every card drawn, does a
 * film without a poster still get its title, is a long title cut — are about
 * the calls, not the pixels.
 */
function recorder(charWidth = 10) {
  const calls: {
    text: string[];
    images: number;
    rects: number;
    fills: string[];
    strokes: number;
  } = { text: [], images: 0, rects: 0, fills: [], strokes: 0 };
  const painter: Painter = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: () => {
      calls.rects += 1;
    },
    fillText: (text) => {
      calls.text.push(text);
    },
    measureText: (text) => ({ width: text.length * charWidth }),
    drawImage: () => {
      calls.images += 1;
    },
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    arcTo: () => undefined,
    closePath: () => undefined,
    lineTo: () => undefined,
    stroke: () => {
      calls.strokes += 1;
    },
    fill() {
      // Only ever a colour string in this module; a canvas would also accept a
      // gradient or a pattern, which is why the interface is wider.
      calls.fills.push(String(painter.fillStyle));
    },
    clip: () => undefined,
  };
  return { painter, calls };
}

const PALETTE: Palette = {
  tiers: { s: 'S-COLOR', a: 'A-COLOR', b: 'B-COLOR', c: 'C-COLOR', d: 'D-COLOR', f: 'F-COLOR' },
  ink: 'INK',
  inkDim: 'INK-DIM',
  screen: 'SCREEN',
  surface: 'SURFACE',
  line: 'LINE',
  onAccent: 'ON-ACCENT',
  display: 'Display',
  text: 'Text',
};

describe('posterUrl', () => {
  it('asks TMDB for a larger size than the cards on screen use', () => {
    // An export is looked at closely, and often at more than one-to-one.
    expect(posterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg');
  });
});

describe('fitText', () => {
  it('leaves text that fits alone', () => {
    const { painter } = recorder();
    expect(fitText(painter, 'Heat', 100)).toBe('Heat');
  });

  it('cuts to an ellipsis when it does not fit', () => {
    const { painter } = recorder();
    // 10px a character: 'Apocalypse Now' is 140 wide, so at 60 the answer is
    // five characters and the ellipsis, itself 10 wide.
    expect(fitText(painter, 'Apocalypse Now', 60)).toBe('Apoca…');
  });

  it('never returns something wider than it was given', () => {
    const { painter } = recorder();
    for (const width of [0, 5, 9, 10, 11, 30, 200]) {
      expect(
        painter.measureText(fitText(painter, 'Apocalypse Now', width)).width,
      ).toBeLessThanOrEqual(width);
    }
  });

  it('returns nothing at all when not even an ellipsis fits', () => {
    // Rather than overflowing the box it was told to stay inside.
    const { painter } = recorder();
    expect(fitText(painter, 'Heat', 4)).toBe('');
  });
});

describe('paint', () => {
  const films = [
    film('a', { title: 'Heat', posterPath: '/heat.jpg' }),
    film('b', { title: 'Ronin' }),
    film('c', { title: 'Collateral', posterPath: '/coll.jpg' }),
  ];
  let board = createBoard('board-1', 'My ranking');
  board = moveFilm(board, 'a', { tierId: 'S', index: 0 });
  board = moveFilm(board, 'b', { tierId: 'S', index: 1 });
  board = moveFilm(board, 'c', { tierId: 'D', index: 0 });
  const layout = layoutBoard(board, films, DEFAULT_LAYOUT);

  it('draws a poster for each film that has one loaded', () => {
    const { painter, calls } = recorder(1);
    const posters = new Map<string, CanvasImageSource>([
      ['a', {} as CanvasImageSource],
      ['c', {} as CanvasImageSource],
    ]);
    paint(painter, layout, PALETTE, posters);
    expect(calls.images).toBe(2);
  });

  it('draws the title of a film with no poster loaded', () => {
    const { painter, calls } = recorder(1);
    paint(painter, layout, PALETTE, new Map());
    // Every film's title, plus the board's name in the header.
    expect(calls.text).toContain('Ronin');
    expect(calls.text).toContain('Heat');
    expect(calls.text).toContain('My ranking');
  });

  it('falls back to the title when a poster failed to load', () => {
    // The distinction that matters: `posterPath` being set is not the same as
    // the image having arrived. A card whose download failed must still say
    // what film it is, not be an empty rectangle.
    const { painter, calls } = recorder(1);
    paint(painter, layout, PALETTE, new Map());
    expect(calls.images).toBe(0);
    expect(calls.text).toContain('Heat');
  });

  it('fills each row block with its own tier colour', () => {
    const { painter, calls } = recorder(1);
    paint(painter, layout, PALETTE, new Map([['a', {} as CanvasImageSource]]));
    expect(calls.fills).toContain('S-COLOR');
    expect(calls.fills).toContain('F-COLOR');
  });

  it('paints the whole image with the theme ground first', () => {
    const { painter, calls } = recorder(1);
    paint(painter, layout, PALETTE, new Map());
    // One fillRect, covering everything, before anything is drawn on it.
    expect(calls.rects).toBe(1);
  });

  it('draws every row, including the empty ones', () => {
    const { painter, calls } = recorder(1);
    paint(painter, layout, PALETTE, new Map());
    for (const tier of board.tiers) {
      expect(calls.text).toContain(tier.label);
    }
  });
});

describe('loadPosters', () => {
  it('asks only for the films that have a poster path', async () => {
    const films = [film('a', { posterPath: '/a.jpg' }), film('b')];
    let board = createBoard('board-1', 'x');
    board = moveFilm(board, 'a', { tierId: 'S', index: 0 });
    board = moveFilm(board, 'b', { tierId: 'S', index: 1 });
    const load = vi.fn().mockResolvedValue({} as CanvasImageSource);

    await loadPosters(layoutBoard(board, films), load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('https://image.tmdb.org/t/p/w185/a.jpg');
  });

  it('leaves out the ones that failed rather than storing a null', () => {
    // `paint` reads this map with `get`, and a stored null would be
    // indistinguishable from a hit for anything checking presence.
    const films = [film('a', { posterPath: '/a.jpg' }), film('b', { posterPath: '/b.jpg' })];
    let board = createBoard('board-1', 'x');
    board = moveFilm(board, 'a', { tierId: 'S', index: 0 });
    board = moveFilm(board, 'b', { tierId: 'S', index: 1 });
    const load = (url: string) =>
      Promise.resolve(url.includes('/a.jpg') ? ({} as CanvasImageSource) : null);

    return loadPosters(layoutBoard(board, films), load).then((posters) => {
      expect([...posters.keys()]).toEqual(['a']);
    });
  });
});

describe('readPalette', () => {
  it('reads every colour and face off the element it is given', () => {
    const element = document.createElement('div');
    element.style.setProperty('--color-tier-s', '#111111');
    element.style.setProperty('--color-ink', '#222222');
    element.style.setProperty('--font-display', 'Oswald');
    document.body.append(element);

    const palette = readPalette(element);

    expect(palette.tiers.s).toBe('#111111');
    expect(palette.ink).toBe('#222222');
    expect(palette.display).toBe('Oswald');
    element.remove();
  });
});

describe('pngFilename', () => {
  it('is the shared board file name with a png extension', () => {
    // The rule itself lives in domain/filename.ts and is tested there; what
    // this pins is that the two things a board saves as agree on it.
    expect(pngFilename('Best of the 90s')).toBe('cinetier-best-of-the-90s.png');
  });
});
