import { fitCardWidth, layoutBoard, DEFAULT_LAYOUT } from '@/domain/boardLayout';
import type { BoardLayout, LayoutCard, LayoutRow } from '@/domain/boardLayout';
import type { Film } from '@/domain/film';
import type { TierBoard } from '@/domain/tiers';
import type { TierColor } from '@/domain/tiers';
import { TIER_COLORS } from '@/domain/tiers';
import { boardFilename } from '@/domain/filename';

/**
 * The colours and faces an export is drawn in, read from the page rather than
 * written down here.
 *
 * Two reasons, and the second is the one that matters. A picture in colours
 * that are not the theme's is a picture of a different application; and no
 * file under src/ui is allowed a colour literal, which is what keeps the two
 * themes defined in exactly one place. Reading the custom properties off a
 * live element gets both for free, including a theme added later.
 */
export interface Palette {
  tiers: Record<TierColor, string>;
  ink: string;
  inkDim: string;
  screen: string;
  surface: string;
  line: string;
  onAccent: string;
  display: string;
  text: string;
}

export function readPalette(element: Element): Palette {
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const tiers = Object.fromEntries(
    TIER_COLORS.map((color) => [color, read(`--color-tier-${color}`)]),
  ) as Record<TierColor, string>;

  return {
    tiers,
    ink: read('--color-ink'),
    inkDim: read('--color-ink-dim'),
    screen: read('--color-screen'),
    surface: read('--color-surface'),
    line: read('--color-line'),
    onAccent: read('--color-on-accent'),
    display: read('--font-display'),
    text: read('--font-text'),
  };
}

/**
 * Where a poster of this size lives on TMDB's image host.
 *
 * w185 rather than the w154 the cards use. It costs a fresh request per ranked
 * film — a different URL is a different cache entry, so nothing already on
 * screen is reused — and it is worth it: the image is drawn at twice the
 * layout's size, which puts a card at 208 device pixels, and a 154-wide source
 * upscaled that far is visibly soft in the one artefact of this application
 * anyone else ever sees.
 */
export function posterUrl(path: string): string {
  return `https://image.tmdb.org/t/p/w185${path}`;
}

/** Only what this module draws with — so a test can pass a recorder instead. */
export interface Painter {
  // A canvas context accepts a gradient or a pattern here too; this module
  // only ever assigns a colour string, and widening the type to match would
  // make a recorder in a test carry two cases it can never see.
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: CanvasImageSource, x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  lineTo(x: number, y: number): void;
}

const CARD_RADIUS = 6;
const PANEL_RADIUS = 12;
const LABEL_RADIUS = 8;

function roundedPath(
  painter: Painter,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  // arcTo rather than roundRect: the same shape, and supported everywhere this
  // application already runs, with no feature test to get wrong.
  const r = Math.min(radius, w / 2, h / 2);
  painter.beginPath();
  painter.moveTo(x + r, y);
  painter.arcTo(x + w, y, x + w, y + h, r);
  painter.arcTo(x + w, y + h, x, y + h, r);
  painter.arcTo(x, y + h, x, y, r);
  painter.arcTo(x, y, x + w, y, r);
  painter.closePath();
}

/**
 * The longest prefix of `text` that fits `maxWidth`, with an ellipsis when it
 * had to cut. Returns an empty string when not even the ellipsis fits, rather
 * than overflowing its box.
 */
export function fitText(painter: Painter, text: string, maxWidth: number): string {
  if (painter.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  if (painter.measureText(ellipsis).width > maxWidth) return '';
  let cut = text.length;
  while (cut > 0 && painter.measureText(text.slice(0, cut) + ellipsis).width > maxWidth) {
    cut -= 1;
  }
  return cut === 0 ? ellipsis : text.slice(0, cut) + ellipsis;
}

/**
 * Break `text` into lines that each fit `maxWidth`, at most `maxLines` of them.
 *
 * Words first, and inside a word wherever it has to break — a row's label is a
 * field a person types into, and a single long word has to fit the same narrow
 * block as the letter "S". The last line is cut with an ellipsis if the text
 * runs past `maxLines`, because a row's name spilling into the row below reads
 * as a rendering fault rather than as a long name.
 */
export function wrapText(
  painter: Painter,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = '';

  const push = () => {
    if (line !== '') lines.push(line);
    line = '';
  };

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (painter.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    push();
    if (painter.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    // A word too long for a line of its own, broken a character at a time.
    for (const character of word) {
      if (painter.measureText(line + character).width > maxWidth && line !== '') {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  push();

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fitText(painter, `${kept[maxLines - 1] ?? ''}…`, maxWidth);
  return kept;
}

function drawCard(
  painter: Painter,
  card: LayoutCard,
  palette: Palette,
  poster: CanvasImageSource | undefined,
): void {
  if (poster) {
    painter.save();
    roundedPath(painter, card.x, card.y, card.width, card.height, CARD_RADIUS);
    painter.clip();
    painter.drawImage(poster, card.x, card.y, card.width, card.height);
    painter.restore();
  } else {
    // No poster, or one that would not load: the title is the card, exactly as
    // it is on screen. A film is never drawn as an empty rectangle.
    painter.fillStyle = palette.screen;
    roundedPath(painter, card.x, card.y, card.width, card.height, CARD_RADIUS);
    painter.fill();

    painter.fillStyle = palette.inkDim;
    painter.font = `12px ${palette.text}`;
    painter.textAlign = 'center';
    painter.textBaseline = 'middle';
    painter.fillText(
      fitText(painter, card.title, card.width - 12),
      card.x + card.width / 2,
      card.y + card.height / 2,
    );
  }

  // A hairline around every card, poster or not. Posters are dark at the edges
  // as often as not, and without it they bleed into the panel behind them.
  painter.strokeStyle = palette.line;
  painter.lineWidth = 1;
  roundedPath(painter, card.x + 0.5, card.y + 0.5, card.width - 1, card.height - 1, CARD_RADIUS);
  painter.stroke();
}

function drawRow(painter: Painter, row: LayoutRow, layout: BoardLayout, palette: Palette): void {
  const { padding, rowPadding, labelWidth } = layout.options;
  const panelWidth = layout.width - padding * 2;

  // The band the row sits on. Without it the rows float on the ground colour
  // and a row holding nothing is indistinguishable from the gap above it.
  painter.fillStyle = palette.surface;
  roundedPath(painter, padding, row.y, panelWidth, row.height, PANEL_RADIUS);
  painter.fill();

  const labelX = padding + rowPadding;
  const labelH = row.height - rowPadding * 2;
  painter.fillStyle = palette.tiers[row.color];
  roundedPath(
    painter,
    labelX,
    row.y + rowPadding,
    labelWidth - rowPadding * 2,
    labelH,
    LABEL_RADIUS,
  );
  painter.fill();

  // Sized by what it holds, like the block on screen: the letters S through F
  // are what this column is shaped for and should look like a tier list's
  // letters, and a name of any length has to fit the same width. At 26px even
  // "Jamais" came out as "Jam…".
  const short = row.label.length <= 2;
  const size = short ? 28 : 15;
  painter.fillStyle = palette.onAccent;
  painter.font = `600 ${String(size)}px ${palette.display}`;
  painter.textAlign = 'center';
  painter.textBaseline = 'middle';

  const inner = labelWidth - rowPadding * 2 - 8;
  const lineHeight = size * 1.15;
  const lines = wrapText(painter, row.label, inner, Math.max(1, Math.floor(labelH / lineHeight)));
  const top = row.y + row.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    painter.fillText(line, labelX + (labelWidth - rowPadding * 2) / 2, top + index * lineHeight);
  });
}

/** Draw a laid-out board. Everything about *where* was decided by the layout. */
export function paint(
  painter: Painter,
  layout: BoardLayout,
  palette: Palette,
  posters: Map<string, CanvasImageSource>,
): void {
  painter.fillStyle = palette.screen;
  painter.fillRect(0, 0, layout.width, layout.height);

  const { padding } = layout.options;
  const inner = layout.width - padding * 2;

  painter.textAlign = 'left';
  painter.textBaseline = 'alphabetic';

  painter.fillStyle = palette.ink;
  painter.font = `600 36px ${palette.display}`;
  painter.fillText(fitText(painter, layout.name, inner), padding, padding + 34);

  painter.fillStyle = palette.inkDim;
  painter.font = `14px ${palette.text}`;
  painter.fillText(fitText(painter, layout.subtitle, inner), padding, padding + 60);

  // A hairline under the masthead, so the name reads as a heading rather than
  // as the first row's caption.
  painter.strokeStyle = palette.line;
  painter.lineWidth = 1;
  painter.beginPath();
  painter.moveTo(padding, layout.headerHeight - 18.5);
  painter.arcTo(
    layout.width - padding,
    layout.headerHeight - 18.5,
    layout.width - padding,
    layout.headerHeight - 18.5,
    0,
  );
  painter.stroke();

  for (const row of layout.rows) {
    drawRow(painter, row, layout, palette);
    for (const card of row.cards) {
      drawCard(painter, card, palette, posters.get(card.filmId));
    }
  }

  painter.fillStyle = palette.inkDim;
  painter.font = `12px ${palette.text}`;
  // Both reset explicitly: the rows above leave the alignment centred and the
  // baseline middle, and inheriting that put half the footer off the canvas.
  painter.textAlign = 'left';
  painter.textBaseline = 'middle';
  painter.fillText(FOOTER, padding, layout.height - layout.options.footerHeight / 2);
}

/**
 * The strip along the bottom. Says where the picture came from, which is the
 * whole point of a picture you post somewhere, and says the one thing about
 * this application worth repeating to a stranger.
 */
const FOOTER = 'Made with Cinetier — your ratings never left your browser';

/**
 * Load every poster the layout needs, skipping the ones that fail.
 *
 * A missing poster costs that card its picture and nothing else — the export
 * of a library TMDB never answered for is still a tier list. The images are
 * requested with `crossOrigin`, without which the canvas would be tainted and
 * `toBlob` would throw a security error at the very end, after all the work.
 */
export async function loadPosters(
  layout: BoardLayout,
  load: (url: string) => Promise<CanvasImageSource | null>,
): Promise<Map<string, CanvasImageSource>> {
  const wanted = layout.rows
    .flatMap((row) => row.cards)
    .filter((card): card is LayoutCard & { posterPath: string } => card.posterPath !== null);

  const loaded = await Promise.all(
    wanted.map(async (card) => [card.filmId, await load(posterUrl(card.posterPath))] as const),
  );

  return new Map(loaded.filter((entry): entry is [string, CanvasImageSource] => entry[1] !== null));
}

/** Fetch one image, or null if it does not load. */
function loadImage(url: string): Promise<CanvasImageSource | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      resolve(null);
    };
    image.src = url;
  });
}

/** A board's PNG, named to match the `.json` beside it. */
export function pngFilename(boardName: string): string {
  return boardFilename(boardName, 'png');
}

/**
 * The tallest image worth asking a browser to allocate.
 *
 * Chrome refuses a canvas past roughly 16384 pixels on a side, and past a few
 * hundred megapixels of area, and it refuses by making `toBlob` hand back
 * null — not by throwing. `fitCardWidth` shrinks the cards until the board
 * fits inside this, so the failure never happens rather than being reported.
 */
const MAX_EXPORT_HEIGHT = 7000;

/**
 * Drawn at twice the layout's size.
 *
 * Everything in the layout is in the same units the board uses on screen, and
 * an image at those numbers looks soft the moment anyone opens it at full
 * size — which is what happens to a picture posted anywhere. The canvas is
 * twice as big and the context is scaled, so nothing in the drawing code has
 * to know. MAX_EXPORT_HEIGHT is the layout height, before this multiplies it.
 */
const SCALE = 2;

/** Render a board to a PNG. Null if the browser would not give up the bytes. */
export async function renderBoardPng(
  board: TierBoard,
  films: Film[],
  palette: Palette,
): Promise<Blob | null> {
  const cardWidth = fitCardWidth(board, films, MAX_EXPORT_HEIGHT);
  const layout = layoutBoard(board, films, { ...DEFAULT_LAYOUT, cardWidth });

  // Without this the header and the row letters are drawn in the fallback
  // face, since a font that has not loaded silently is not an error.
  await document.fonts.ready;
  const posters = await loadPosters(layout, loadImage);

  const canvas = document.createElement('canvas');
  canvas.width = layout.width * SCALE;
  canvas.height = layout.height * SCALE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.scale(SCALE, SCALE);
  // Posters are drawn smaller than they arrive; without this they alias badly
  // along every hard edge, which on a poster is most of it.
  context.imageSmoothingQuality = 'high';

  paint(context, layout, palette, posters);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/png');
  });
}
