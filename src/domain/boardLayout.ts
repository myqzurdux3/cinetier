import type { Film } from './film';
import type { TierBoard, TierColor } from './tiers';

/**
 * Where every piece of an exported board goes, in pixels, decided without a
 * DOM.
 *
 * The export is a picture of the rows, not a screenshot of the screen: the
 * pool, the rail, the row controls and the scroll position are all absent from
 * it, and the whole board is drawn at once however tall that makes it. So the
 * geometry cannot be read off the page — it has to be computed — and computing
 * it here, as arithmetic over numbers, is what lets it be tested at all.
 */

export interface LayoutOptions {
  /** How wide one poster is drawn. Height follows from the 2:3 aspect ratio. */
  cardWidth: number;
  gap: number;
  padding: number;
  /** The inset between a row's panel and the cards inside it. */
  rowPadding: number;
  /** The coloured block carrying the row's letter. */
  labelWidth: number;
  /** The band at the top carrying the board's name and its count. */
  headerHeight: number;
  /** The strip at the bottom carrying the attribution. */
  footerHeight: number;
  /** The image's total width. Rows wrap inside whatever is left of it. */
  width: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  cardWidth: 104,
  gap: 10,
  padding: 24,
  rowPadding: 10,
  labelWidth: 88,
  headerHeight: 112,
  footerHeight: 44,
  width: 1440,
};

/** A poster's height is 1.5x its width, matching the cards on screen. */
export const CARD_ASPECT_RATIO = 3 / 2;

export interface LayoutCard {
  filmId: string;
  title: string;
  posterPath: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutRow {
  tierId: string;
  label: string;
  color: TierColor;
  y: number;
  height: number;
  cards: LayoutCard[];
}

export interface BoardLayout {
  name: string;
  /** The line under the name: how much was ranked, and across how many rows. */
  subtitle: string;
  width: number;
  height: number;
  headerHeight: number;
  rows: LayoutRow[];
  options: LayoutOptions;
}

/**
 * How many cards fit on one line of a row.
 *
 * At least one, always: a width too narrow to fit a single card would
 * otherwise divide by a zero-length line and loop forever building the row.
 */
export function cardsPerLine(options: LayoutOptions): number {
  const available = options.width - options.padding * 2 - options.labelWidth - options.gap;
  const perCard = options.cardWidth + options.gap;
  return Math.max(1, Math.floor((available + options.gap) / perCard));
}

/** The height of a row's panel holding `count` cards, empty rows included. */
export function rowHeight(count: number, options: LayoutOptions): number {
  const cardHeight = options.cardWidth * CARD_ASPECT_RATIO;
  const lines = Math.max(1, Math.ceil(count / cardsPerLine(options)));
  return lines * cardHeight + (lines - 1) * options.gap + options.rowPadding * 2;
}

/** "24 films across 4 rows", or the singular of each where it applies. */
export function describeBoard(cardCount: number, filledRows: number): string {
  const films = cardCount === 1 ? '1 film' : `${String(cardCount)} films`;
  const rows = filledRows === 1 ? '1 row' : `${String(filledRows)} rows`;
  return `${films} across ${rows}`;
}

/**
 * Lay out a board for export.
 *
 * Films are resolved from `films` by id; an id with no film behind it is
 * skipped rather than drawn as a gap, which is the same thing the board itself
 * does while a library is still loading.
 */
export function layoutBoard(
  board: TierBoard,
  films: Film[],
  options: LayoutOptions = DEFAULT_LAYOUT,
): BoardLayout {
  const byId = new Map(films.map((film) => [film.id, film]));
  const perLine = cardsPerLine(options);
  const cardHeight = options.cardWidth * CARD_ASPECT_RATIO;

  let y = options.headerHeight;
  const rows: LayoutRow[] = [];

  for (const tier of board.tiers) {
    const placed = (board.placements[tier.id] ?? [])
      .map((id) => byId.get(id))
      .filter((film): film is Film => film !== undefined);

    const height = rowHeight(placed.length, options);
    const cards = placed.map((film, index) => ({
      filmId: film.id,
      title: film.title,
      posterPath: film.posterPath,
      x:
        options.padding +
        options.labelWidth +
        options.gap +
        (index % perLine) * (options.cardWidth + options.gap),
      y: y + options.rowPadding + Math.floor(index / perLine) * (cardHeight + options.gap),
      width: options.cardWidth,
      height: cardHeight,
    }));

    rows.push({ tierId: tier.id, label: tier.label, color: tier.color, y, height, cards });
    y += height + options.gap;
  }

  const cardCount = rows.reduce((total, row) => total + row.cards.length, 0);
  return {
    name: board.name,
    subtitle: describeBoard(cardCount, rows.filter((row) => row.cards.length > 0).length),
    width: usedWidth(rows, perLine, options),
    // The trailing gap after the last row is absorbed into the footer strip
    // rather than added to it, so the space below the last row matches the
    // space above the first.
    height: y - options.gap + options.footerHeight,
    headerHeight: options.headerHeight,
    rows,
    options,
  };
}

/**
 * How wide the image actually needs to be: the label column plus the longest
 * line any row draws, never more than `options.width`.
 *
 * A board is laid out against a width budget, but a ranking of ten films uses
 * a fifth of it and the rest would be exported as empty ground — an image
 * three times wider than its contents, which is not what anyone wants to post.
 * Trimming cannot change the wrapping, because the count it trims to is the
 * count that already fits on a line.
 */
function usedWidth(rows: LayoutRow[], perLine: number, options: LayoutOptions): number {
  const longest = rows.reduce(
    (most, row) => Math.max(most, Math.min(row.cards.length, perLine)),
    0,
  );
  if (longest === 0) return options.padding * 2 + options.labelWidth;
  const cards = longest * options.cardWidth + (longest - 1) * options.gap;
  // `rowPadding` again on the right: the row's panel runs the full width, and
  // without it the last card on a full line ends flush against the panel's
  // edge while every other side of it is inset.
  return options.padding * 2 + options.labelWidth + options.gap + cards + options.rowPadding;
}

/**
 * The largest whole card width, at most `DEFAULT_LAYOUT.cardWidth`, whose
 * layout fits inside `maxHeight`.
 *
 * A board is as tall as its contents, and a browser refuses to allocate a
 * canvas past a few tens of megapixels — a thousand ranked films at the
 * default card width is well past it, and `toBlob` on an over-large canvas
 * fails by returning null rather than by throwing, which is the kind of
 * failure that reaches a user as a button that does nothing. Shrinking the
 * cards keeps the export working on a board of any size; below `minCardWidth`
 * it stops, because a picture of two-pixel posters is not worth producing.
 */
export function fitCardWidth(
  board: TierBoard,
  films: Film[],
  maxHeight: number,
  options: LayoutOptions = DEFAULT_LAYOUT,
  minCardWidth = 24,
): number {
  for (let width = options.cardWidth; width >= minCardWidth; width -= 4) {
    if (layoutBoard(board, films, { ...options, cardWidth: width }).height <= maxHeight) {
      return width;
    }
  }
  return minCardWidth;
}
