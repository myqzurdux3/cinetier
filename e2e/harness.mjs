/**
 * The pieces every check below needs: a browser, a library, and a drag.
 *
 * Playwright drives a real, visible Chromium. That matters more here than
 * anywhere else in this project's testing: drag and drop is pointer events and
 * layout, and jsdom has neither — every element it measures is 0x0, so no drag
 * can be driven under it at all. Every defect this suite exists to catch was
 * reachable only through a real one.
 */
import { chromium } from 'playwright';

export const APP_URL = process.env.CINETIER_URL ?? 'http://localhost:5173/';

/**
 * Playwright's npm package pins a browser revision, and the machine this was
 * written on had a different one already downloaded. An explicit path uses
 * whatever is there rather than demanding `npx playwright install` first.
 */
const EXECUTABLE = process.env.CHROMIUM_PATH;

const TITLES = [
  ['tt0000001', 'Alpha', 1990, 10],
  ['tt0000002', 'Bravo', 1991, 9],
  ['tt0000003', 'Charlie', 1992, 8],
  ['tt0000004', 'Delta', 1993, 7],
  ['tt0000005', 'Echo', 1994, 6],
  ['tt0000006', 'Foxtrot', 1995, 5],
  ['tt0000007', 'Golf', 1996, 4],
  ['tt0000008', 'Hotel', 1997, 3],
  ['tt0000009', 'India', 1998, 2],
  ['tt0000010', 'Juliett', 1999, 1],
];

/** An IMDb ratings export, in the shape `parseImdbRatings` actually accepts. */
export function ratingsCsv(rows = TITLES) {
  const head =
    'Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors';
  const body = rows.map(
    ([id, title, year, rating]) =>
      `${id},${rating},2025-03-0${(rating % 9) + 1},${title},${title},https://www.imdb.com/title/${id}/,Movie,7.${rating},1${String(10 + rating)},${year},Drama,1000,${year}-01-01,Dir ${title[0]}`,
  );
  return [head, ...body].join('\n');
}

/** `count` films named `Film 000`, `Film 001`, … with ratings cycling 1-10. */
export function manyFilms(count) {
  return Array.from({ length: count }, (_, i) => [
    `tt${String(1000000 + i)}`,
    `Film ${String(i).padStart(3, '0')}`,
    1960 + (i % 60),
    (i % 10) + 1,
  ]);
}

export async function open({ width = 1280, height = 900, touch = false } = {}) {
  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  // Offline and deterministic. With no poster, every card's text *is* the
  // film's title, which is what the assertions below read.
  await context.route(/^https:\/\/(api\.themoviedb\.org|image\.tmdb\.org)/, (route) =>
    route.abort(),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    // The aborted TMDB requests above are the only expected noise.
    if (message.type() === 'error' && !/ERR_FAILED/.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return { browser, page, errors };
}

export async function importLibrary(page, csv = ratingsCsv()) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /IMDb/ }).click();
  await page.waitForSelector('input[type=file]');
  await page.setInputFiles('input[type=file]', {
    name: 'ratings.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.waitForSelector('section[aria-label="Pool"]');
  await page.waitForTimeout(600);
}

/**
 * Press, move in small steps, release.
 *
 * The steps are not politeness: dnd-kit's MouseSensor activates on distance
 * travelled and tracks the pointer between moves, so one jump from source to
 * target starts no drag at all.
 */
/**
 * The vertical middle of whatever part of `box` is actually on screen.
 *
 * A drop target can be taller than the window — the pool is a full-height
 * column on a wide screen — and its geometric centre is then somewhere nobody
 * can point at. Aiming at the middle of the visible part is what a person
 * does, and it fails loudly below if none of it is visible.
 */
function visibleCentre(box, viewport) {
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, viewport);
  if (bottom <= top) throw new Error('the drop target is entirely off screen');
  return (top + bottom) / 2;
}

export async function drag(page, from, to, { steps = 24 } = {}) {
  await from.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('a drag endpoint has no box');
  const viewport = await page.evaluate(() => innerHeight);
  const sourceCentre = a.y + a.height / 2;
  if (sourceCentre < 0 || sourceCentre > viewport) {
    throw new Error(`the card to drag is off screen at y=${Math.round(sourceCentre)}`);
  }

  const [ax, ay] = [a.x + a.width / 2, a.y + a.height / 2];
  const [bx, by] = [b.x + b.width / 2, visibleCentre(b, viewport)];
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
    await page.waitForTimeout(8);
  }
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(450);
}

/**
 * Playwright's `page.touchscreen` taps and swipes, but cannot hold a finger
 * down across several moves, which is exactly what a drag is. CDP can.
 */
const finger = async (page) => {
  const session = await page.context().newCDPSession(page);
  const at = (x, y) => [{ x, y }];
  return {
    down: (x, y) => session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(x, y) }),
    move: (x, y) => session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x, y) }),
    up: () => session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  };
};

/**
 * A finger drag: press, hold still, then move.
 *
 * The hold is the point. A touch that moves at once is a scroll — the pool is
 * nothing but cards, so a finger must be able to scroll from one — and only a
 * press held past the TouchSensor's delay becomes a drag. `hold` shorter than
 * that delay is how the scroll case below is driven.
 */
export async function touchDrag(page, from, to, { steps = 24, hold = 350 } = {}) {
  await from.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('a drag endpoint has no box');
  const viewport = await page.evaluate(() => innerHeight);
  const [ax, ay] = [a.x + a.width / 2, a.y + a.height / 2];
  if (ay < 0 || ay > viewport) {
    throw new Error(`the card to drag is off screen at y=${Math.round(ay)}`);
  }
  const [bx, by] = [b.x + b.width / 2, visibleCentre(b, viewport)];

  const touch = await finger(page);
  await touch.down(ax, ay);
  await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i += 1) {
    await touch.move(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(120);
  await touch.up();
  await page.waitForTimeout(450);
}

/**
 * A finger that moves as soon as it lands: the gesture a person makes to
 * scroll. `dy` is negative to move content up, as a real swipe does.
 */
export async function touchSwipe(page, from, dy, { steps = 12 } = {}) {
  await from.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const a = await from.boundingBox();
  if (!a) throw new Error('the swipe has no starting box');
  const [ax, ay] = [a.x + a.width / 2, a.y + a.height / 2];
  const touch = await finger(page);
  await touch.down(ax, ay);
  for (let i = 1; i <= steps; i += 1) {
    await touch.move(ax, ay + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await touch.up();
  await page.waitForTimeout(300);
}

/** Row label -> its films in order, read from the DOM a person is looking at. */
export function rows(page) {
  return page.evaluate(() => {
    const out = {};
    for (const list of document.querySelectorAll('ul[aria-label]')) {
      const label = list.getAttribute('aria-label');
      if (!label || !/\d+ films?$/.test(label)) continue;
      out[label.split(' — ')[0]] = [...list.querySelectorAll('li')]
        .map((item) => item.textContent.trim())
        .filter((text) => text && text !== 'Drop films here');
    }
    return out;
  });
}

export const poolCard = (page, title) =>
  page
    .locator('section[aria-label="Pool"] [aria-roledescription]')
    .filter({ hasText: new RegExp(`^${title}$`) })
    .first();

export const rowList = (page, label) => page.locator(`ul[aria-label^="${label} —"]`);

export const rowCard = (page, label, title) =>
  rowList(page, label)
    .locator('li')
    .filter({ hasText: new RegExp(`^${title}$`) })
    .first();

/**
 * The coloured block at the left of each row: its text, its colour, and
 * whether what it holds fits.
 *
 * Found through the row's own list rather than by a width class. The block's
 * width is a layout choice that has already changed once, and a check that
 * goes green because its selector found nothing is worse than no check —
 * which is exactly what happened.
 */
export const labelBlocks = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('ul[aria-label]')]
      .filter((list) => /\d+ films?$/.test(list.getAttribute('aria-label') ?? ''))
      .map((list) => {
        // TierRow: a flex row of [the coloured block, a column holding the
        // controls and this list]. SortableContext renders no element of its
        // own, so the list's parent is that column.
        const block = list.parentElement?.previousElementSibling;
        if (!block) return null;
        const style = getComputedStyle(block);
        return {
          text: block.textContent.trim(),
          background: style.backgroundColor,
          align: style.textAlign,
          overflow: Math.round(block.scrollWidth - block.clientWidth),
        };
      }),
  );

/** What dnd-kit last announced, which is what a screen reader would have said. */
export const announcement = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[aria-live]')]
        .map((n) => n.textContent.trim())
        .filter(Boolean)
        .at(-1) ?? '',
  );
