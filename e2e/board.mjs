/**
 * End-to-end checks for the tier board, driven through a real browser.
 *
 * Each one exists because it caught something. The comment on each says what,
 * so that a check which stops discriminating is recognisable as such rather
 * than kept for its green tick. Run with `npm run e2e` against a dev server or
 * a preview of the production build; see e2e/README.md.
 */
import {
  APP_URL,
  announcement,
  drag,
  importLibrary,
  manyFilms,
  open,
  poolCard,
  ratingsCsv,
  rowCard,
  labelBlocks,
  rowList,
  rows,
  touchDrag,
  touchSwipe,
} from './harness.mjs';

const checks = [];
/**
 * `viewport` is not decoration. The board is a different arrangement above and
 * below the three-column breakpoint — beside the rows on a wide screen, under
 * them on a narrow one — and a suite that only ever runs wide tests one of
 * them.
 */
const check = (name, run, viewport) => checks.push({ name, run, viewport });

const eq = (actual, expected, what) => {
  const [a, b] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
};

check('a film can be dragged from the pool to a row, and back', async (page) => {
  // The whole feature, and the one the pool's 78vh height used to make
  // impossible on a normal window: the rows and the pool were never on screen
  // together, and there is no scrolling mid-drag.
  await importLibrary(page);
  await drag(page, poolCard(page, 'Alpha'), rowList(page, 'S'));
  eq((await rows(page)).S, ['Alpha'], 'after dragging Alpha to S');

  await drag(page, rowCard(page, 'S', 'Alpha'), page.locator('section[aria-label="Pool"]'));
  eq((await rows(page)).S, [], 'after dragging Alpha back to the pool');
});

check('a film can be dropped into a pool with nothing in it', async (page) => {
  // The state someone reaches by placing everything and then wanting one title
  // back, and the one the pool used to collapse in: a sixty-pixel strip of
  // prose where its grid had been, which a card aimed at its middle missed by
  // two pixels, landing in the row behind. That two-pixel miss depended on the
  // layout where the pool was pinned under the rows and cannot be reproduced
  // now; what this holds is the invariant, that a film aimed at an empty pool
  // arrives in it.
  await importLibrary(page);
  await page.getByRole('button', { name: 'Pre-fill from my ratings' }).click();
  await page.waitForTimeout(700);
  const pool = page.locator('section[aria-label="Pool"]');
  if (!/Every film is placed/.test(await pool.innerText())) {
    throw new Error('pre-fill left something in the pool; this check proves nothing');
  }

  const placed = await rows(page);
  const [row] = Object.entries(placed).find(([, films]) => films.length > 0);
  const title = placed[row][0];
  await drag(page, rowCard(page, row, title), pool);

  const after = await rows(page);
  if (Object.values(after).flat().includes(title)) {
    throw new Error(`${title} was aimed at the empty pool and stayed on the board`);
  }
  if (!/1 film to place/.test(await pool.innerText())) {
    throw new Error(`the pool does not report the film it received: ${await pool.innerText()}`);
  }
});

check('a row below the fold is reached by holding the card at the top edge', async (page) => {
  // Six rows of posters are taller than a laptop window, and there is no
  // scrolling mid-drag. dnd-kit auto-scrolls the scroll ancestors of the
  // *dragged card*, and the window is one — which is the whole reason a scroll
  // pane of the rows' own was the wrong answer, and this the right one.
  await importLibrary(page);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);

  const start = await page.evaluate(() => Math.round(scrollY));
  if (start === 0) throw new Error('the page does not scroll; this check proves nothing');

  const card = poolCard(page, 'Alpha');
  const box = await card.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(x, y - ((y - 40) * i) / 12);
    await page.waitForTimeout(15);
  }
  // Held against the top edge, where dnd-kit's window auto-scroll engages.
  for (let i = 0; i < 40; i += 1) {
    await page.mouse.move(x + (i % 2), 30);
    await page.waitForTimeout(40);
  }
  const scrolled = start - (await page.evaluate(() => Math.round(scrollY)));
  if (scrolled < 100)
    throw new Error(`the page moved ${String(scrolled)}px while a card was held at its top edge`);

  const s = await rowList(page, 'S').boundingBox();
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(400);
  eq((await rows(page)).S, ['Alpha'], 'after auto-scrolling up to row S and dropping there');
});

check('a film lands in the row under the cursor, not the nearest centre', async (page) => {
  // The invariant: a film released inside a row lands in that row, and the
  // announcement said so on the way. Both are asserted, because the outcome
  // alone would not say whether the board agreed with the user before the drop
  // or only happened to end up right.
  //
  // Honest about what this does *not* prove. It was written for the defect
  // where `closestCenter` — "which droppable's centre is nearest" — picked a
  // tall row over the one the pointer was plainly inside. Reverting to
  // `closestCenter` alone no longer fails this check at any aim inside row D
  // that was tried, because that reproduction depended on the layout where the
  // pool was pinned over the rows, and the pool has a column of its own now.
  // The keyboard check below is what catches that revert today. This one
  // guards the invariant, and would catch a future regression that made a drop
  // land somewhere other than where it was aimed.
  await importLibrary(page, ratingsCsv(manyFilms(120)));
  await page.getByRole('button', { name: 'Pre-fill from my ratings' }).click();
  await page.waitForTimeout(1200);

  const before = await rows(page);
  const travelling = before.C[0];

  // Put row D's top around a third of the way down the window, so both it and
  // a card of row C above it sit clear of the bands at the window's edges
  // where dnd-kit would auto-scroll the page out from under the aim.
  await page.evaluate(() => {
    const row = document.querySelector('ul[aria-label^="D —"]');
    scrollBy(0, row.getBoundingClientRect().top - innerHeight * 0.35);
  });
  await page.waitForTimeout(300);

  const card = rowCard(page, 'C', travelling);
  const a = await card.boundingBox();
  const target = await rowList(page, 'D').boundingBox();
  const viewport = await page.evaluate(() => innerHeight);
  const [ax, ay] = [a.x + a.width / 2, a.y + a.height / 2];
  // The *lower* edge of row D, not its middle. That is where the two questions
  // disagree most: the tall row below has its centre nearer to a pointer down
  // here than row D's own centre is, so `closestCenter` picks the wrong one
  // while the pointer is plainly inside the right one.
  const by = Math.min(target.y + target.height - 12, viewport * 0.75);
  if (ay < viewport * 0.05 || ay > viewport * 0.95 || by <= target.y) {
    throw new Error(
      `the two rows are not both reachable: card at ${Math.round(ay)}, row D at ${Math.round(target.y)}`,
    );
  }

  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= 20; i += 1) {
    await page.mouse.move(
      ax + ((target.x + target.width / 2 - ax) * i) / 20,
      ay + ((by - ay) * i) / 20,
    );
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(250);

  const overD = await announcement(page);
  await page.mouse.up();
  await page.waitForTimeout(500);

  if (!/over tier D\b/.test(overD)) {
    throw new Error(`aimed inside row D, but the drop was going to: "${overD}"`);
  }
  const after = await rows(page);
  if (!after.D.includes(travelling)) {
    const landed = Object.entries(after).find(([, films]) => films.includes(travelling))?.[0];
    throw new Error(`aimed at row D, landed in ${landed ?? 'the pool'}`);
  }
});

check('a card scrolled out of view in the pool does not steal the drop', async (page) => {
  // The pool's grid is virtualised and keeps a margin of rows mounted outside
  // the visible area. Those cards still have layout rectangles, sitting over
  // the tier rows, and dnd-kit hit-tests rectangles without knowing about
  // clipping — so an invisible card was winning drops aimed at a row.
  await importLibrary(page, ratingsCsv(manyFilms(120)));
  const scroller = page.locator('section[aria-label="Pool"] .overflow-y-auto');
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.waitForTimeout(500);

  const last = await page.evaluate(() =>
    [...document.querySelectorAll('section[aria-label="Pool"] [aria-roledescription]')]
      .at(-1)
      ?.textContent.trim(),
  );
  await drag(page, poolCard(page, last), rowList(page, 'F'));
  eq((await rows(page)).F, [last], `after dragging ${last} out of the far end of the pool`);
});

check('a forward move inside one row moves the film', async (page) => {
  // The drop index used to be corrected twice for the dragged card leaving its
  // slot — `moveFilm` removes before it inserts, exactly as arrayMove does —
  // so every forward move landed one slot short and a drop onto the next
  // neighbour was a silent no-op that still burned an undo step.
  await importLibrary(page);
  for (const title of ['Alpha', 'Bravo', 'Charlie']) {
    await drag(page, poolCard(page, title), rowList(page, 'S'));
  }
  eq((await rows(page)).S, ['Alpha', 'Bravo', 'Charlie'], 'three films in S');

  await drag(page, rowCard(page, 'S', 'Alpha'), rowCard(page, 'S', 'Bravo'));
  eq((await rows(page)).S, ['Bravo', 'Alpha', 'Charlie'], 'after moving Alpha one slot forward');
});

check('the keyboard ranks a film end to end', async (page) => {
  // No automated coverage is possible below this level: dnd-kit's keyboard
  // sensor navigates between measured droppables, and jsdom reports every
  // rectangle as zero.
  await importLibrary(page);
  const card = poolCard(page, 'Charlie');
  await card.scrollIntoViewIfNeeded();
  await card.focus();

  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const lifted = await announcement(page);
  if (!/Charlie/.test(lifted)) throw new Error(`nothing was announced on lift: "${lifted}"`);

  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(250);
  }
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);

  const placed = Object.entries(await rows(page)).find(([, films]) => films.includes('Charlie'));
  if (!placed)
    throw new Error(`Charlie was never placed; last announcement: "${await announcement(page)}"`);
});

check('undo and redo return the board, from the buttons and the keyboard', async (page) => {
  await importLibrary(page);
  await drag(page, poolCard(page, 'Alpha'), rowList(page, 'S'));
  await drag(page, poolCard(page, 'Bravo'), rowList(page, 'A'));

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(250);
  eq((await rows(page)).A, [], 'after Undo');

  await page.getByRole('button', { name: 'Redo' }).click();
  await page.waitForTimeout(250);
  eq((await rows(page)).A, ['Bravo'], 'after Redo');

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  eq((await rows(page)).A, [], 'after Ctrl+Z');

  await page.keyboard.press('Control+Shift+Z');
  await page.waitForTimeout(250);
  eq((await rows(page)).A, ['Bravo'], 'after Ctrl+Shift+Z');
});

check('the board, its row names and the filters survive a reload', async (page) => {
  // A row rename used to evict the ranking history; the filters restore used
  // to be cancelled by any board edit.
  await importLibrary(page);
  await drag(page, poolCard(page, 'Alpha'), rowList(page, 'S'));

  await page.getByRole('button', { name: 'Edit rows' }).click();
  const label = page.locator('input[id$="-label"]').first();
  await label.fill('');
  await label.type('Best', { delay: 20 });
  await page.getByLabel('Minimum rating').fill('50');
  await page.waitForTimeout(1000);

  const before = await rows(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('section[aria-label="Pool"]');
  await page.waitForTimeout(1200);

  eq(await rows(page), before, 'the board after a reload');
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => b.textContent.trim()),
  );
  if (!chips.some((text) => /Rating 50 or more/.test(text))) {
    throw new Error('the saved filter criteria did not come back');
  }
});

check('an over-tight filter empties the pool without taking the board away', async (page) => {
  // It used to replace the whole board — rows, films and all — so one
  // criterion too many read as "your ranking is gone".
  await importLibrary(page);
  await drag(page, poolCard(page, 'Alpha'), rowList(page, 'S'));
  await page.getByLabel('Minimum rating').fill('101');
  await page.waitForTimeout(700);

  const explained = await page.locator('section[aria-label="Pool"]').innerText();
  if (!/Nothing matches these filters/.test(explained)) {
    throw new Error('the pool did not explain itself');
  }
  eq((await rows(page)).S, ['Alpha'], 'row S while nothing matches');
});

check('every tier colour reaches the browser', async (page) => {
  // Tailwind emits a @theme variable only when something it scanned asks for
  // one, and every reference to these is composed at runtime. Five of the six
  // were dropped from the stylesheet, and the sixth survived on a doc comment.
  await importLibrary(page);
  const backgrounds = (await labelBlocks(page)).map((block) => block?.background ?? 'none');
  if (backgrounds.length !== 6)
    throw new Error(`expected six row labels, saw ${backgrounds.length}`);
  const transparent = backgrounds.filter((colour) => /rgba\(0, 0, 0, 0\)|transparent/.test(colour));
  if (transparent.length > 0) throw new Error(`${transparent.length} row labels have no colour`);
  if (new Set(backgrounds).size !== 6)
    throw new Error(`the six rows share colours: ${backgrounds}`);
});

check('the board exports a PNG', async (page) => {
  await importLibrary(page);
  const button = page.getByRole('button', { name: /Save as PNG/ });
  if (!(await button.isDisabled())) throw new Error('offered an export of an empty board');

  await drag(page, poolCard(page, 'Alpha'), rowList(page, 'S'));
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    button.click(),
  ]);
  if (!/^cinetier-.*\.png$/.test(download.suggestedFilename())) {
    throw new Error(`unexpected file name: ${download.suggestedFilename()}`);
  }
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const png = Buffer.concat(chunks);
  if (png.subarray(1, 4).toString() !== 'PNG') throw new Error('the file is not a PNG');
  // Width and height from the IHDR chunk, which is always first.
  const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (width < 200 || height < 200) throw new Error(`the image is ${width}x${height}`);
});

check('a v2 database is upgraded to the current one without losing anything', async (page) => {
  // Version-independent upgrade: create what is missing, never branch on the
  // version that arrived.
  await page.route('**/blank-for-seeding', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>seed</title>',
    }),
  );
  // A blank document on the app's own origin. It has to be intercepted: Vite
  // answers every unknown path with index.html, so any other URL here boots
  // the app, which creates the database at the current version and leaves
  // nothing to upgrade.
  await page.goto(`${APP_URL}blank-for-seeding`, { waitUntil: 'domcontentloaded' });

  await page.evaluate(async () => {
    const settle = (request, label) =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error(`${label}: ${String(request.error)}`));
        request.onblocked = () => reject(new Error(`${label}: blocked`));
        setTimeout(() => reject(new Error(`${label}: timed out`)), 5000);
      });
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('cinetier');
      request.onsuccess = resolve;
      request.onerror = resolve;
      request.onblocked = resolve;
    });

    const request = indexedDB.open('cinetier', 2);
    request.onupgradeneeded = () => {
      for (const name of ['tmdb', 'tmdbDetails', 'library', 'filters']) {
        request.result.createObjectStore(name);
      }
    };
    const database = await settle(request, 'open at v2');
    const put = (store, value) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(store, 'readwrite');
        transaction.objectStore(store).put(value, 'current');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(new Error(`${store}: ${String(transaction.error)}`));
      });
    await put('library', {
      films: [
        {
          id: 'imdb:tt1',
          imdbId: 'tt1',
          tmdbId: null,
          title: 'Old Alpha',
          year: 1994,
          titleType: 'movie',
          rating: 95,
          ratingScale: 'imdb10',
          watchedAt: new Date('2024-06-01'),
          watchedAtIsApproximate: true,
          isRewatch: false,
          genres: ['Drama'],
          directors: ['Someone'],
          runtimeMinutes: 120,
          publicRating: 80,
          posterPath: null,
          detailsFetched: true,
          source: 'imdb',
        },
      ],
      savedAt: Date.now(),
    });
    await put('filters', { criteria: { minRating: 20 }, savedAt: Date.now() });
    database.close();
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('section[aria-label="Pool"]');
  await page.waitForTimeout(1200);

  const state = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cinetier');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const get = (store) =>
      new Promise((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).get('current');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const library = await get('library');
    const filters = await get('filters');
    const out = {
      version: database.version,
      stores: [...database.objectStoreNames].sort(),
      titles: library?.films.map((film) => film.title),
      watchedAtIsDate: library?.films[0]?.watchedAt instanceof Date,
      criteria: filters?.criteria,
    };
    database.close();
    return out;
  });

  eq(
    state.stores,
    ['boards', 'filters', 'library', 'settings', 'tmdb', 'tmdbDetails'],
    'the stores after upgrading',
  );
  eq(state.titles, ['Old Alpha'], 'the library after upgrading');
  eq(state.criteria, { minRating: 20 }, 'the criteria after upgrading');
  if (state.version < 4) throw new Error(`still at version ${String(state.version)}`);
  if (!state.watchedAtIsDate) throw new Error('watchedAt came back as something other than a Date');
});

check('a second board keeps its own ranking, and survives a reload', async (page) => {
  // Two boards, each with a different film in row S, switched between and then
  // reloaded. What this is really guarding is the write on the way out: the
  // debounced save is keyed on the board, so switching cancels one that was
  // still pending, and an edit made in the last four hundred milliseconds
  // would leave with the board and never arrive anywhere.
  await importLibrary(page);
  await drag(page, poolCard(page, 'Alpha'), rowList(page, 'S'));
  eq((await rows(page)).S, ['Alpha'], 'the first board');

  await page.getByRole('button', { name: 'New board' }).click();
  await page.waitForTimeout(400);
  const name = page.getByLabel('Board name');
  if ((await name.inputValue()) !== 'My ranking 2') {
    throw new Error(`the new board is called "${await name.inputValue()}"`);
  }
  eq((await rows(page)).S, [], 'the second board starts empty');

  await drag(page, poolCard(page, 'Bravo'), rowList(page, 'S'));
  eq((await rows(page)).S, ['Bravo'], 'the second board');

  await page.getByLabel('Switch board').selectOption({ label: 'My ranking' });
  await page.waitForTimeout(500);
  eq((await rows(page)).S, ['Alpha'], 'the first board, switched back to');

  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('section[aria-label="Pool"]');
  await page.waitForTimeout(1200);
  eq((await rows(page)).S, ['Alpha'], 'the board a reload comes back to');

  await page.getByLabel('Switch board').selectOption({ label: 'My ranking 2' });
  await page.waitForTimeout(500);
  eq((await rows(page)).S, ['Bravo'], 'the other board, after a reload');
});

check('a board can be renamed, and the name reaches the exported file', async (page) => {
  // The name is the title of the exported image and the stem of its file name,
  // which is the whole reason it is editable at all.
  await importLibrary(page);
  await drag(page, poolCard(page, 'Alpha'), rowList(page, 'S'));

  const name = page.getByLabel('Board name');
  await name.fill('');
  await name.type('Best of the 90s', { delay: 15 });
  await page.waitForTimeout(400);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: /Save as PNG/ }).click(),
  ]);
  eq(download.suggestedFilename(), 'cinetier-best-of-the-90s.png', 'the downloaded file name');
});

check('a board saved to a file comes back after everything is deleted', async (page) => {
  // The point of the file: carry a ranking to another browser, or back to this
  // one after starting over. Nothing short of actually deleting everything and
  // reading the file back proves it.
  await importLibrary(page);
  await drag(page, poolCard(page, 'Alpha'), rowList(page, 'S'));
  await drag(page, poolCard(page, 'Bravo'), rowList(page, 'A'));
  const name = page.getByLabel('Board name');
  await name.fill('');
  await name.type('Carried over', { delay: 15 });
  await page.waitForTimeout(400);
  const before = await rows(page);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: 'Save as a file' }).click(),
  ]);
  eq(download.suggestedFilename(), 'cinetier-carried-over.json', 'the downloaded file name');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const saved = Buffer.concat(chunks);

  // Everything, deliberately: library, filters and every board.
  await page.getByRole('button', { name: /import a different export/i }).click();
  await page.getByRole('button', { name: /delete everything/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /IMDb/ }).click();
  await page.waitForSelector('input[type=file]');
  await page.setInputFiles('input[type=file]', {
    name: 'cinetier-carried-over.json',
    mimeType: 'application/json',
    buffer: saved,
  });
  await page.waitForSelector('section[aria-label="Pool"]');
  await page.waitForTimeout(1200);

  eq(await rows(page), before, 'the ranking read back from the file');
  eq(await page.getByLabel('Board name').inputValue(), 'Carried over', 'the board name');

  // And it is the board the next save writes, not a copy beside it.
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('section[aria-label="Pool"]');
  await page.waitForTimeout(1200);
  eq(await rows(page), before, 'the ranking after a reload');
  if (await page.getByLabel('Switch board').count()) {
    throw new Error('importing the file left more than one board behind');
  }
});

check('a damaged file is refused with something to do about it', async (page) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /IMDb/ }).click();
  await page.waitForSelector('input[type=file]');
  await page.setInputFiles('input[type=file]', {
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"cinetier": 1, "films": "not a list"}'),
  });
  await page.waitForTimeout(900);

  const text = await page.locator('main').innerText();
  if (!/not a Cinetier export/i.test(text))
    throw new Error(`no explanation: ${text.slice(0, 160)}`);
  if (!/Save as a file/i.test(text)) throw new Error('no hint about where such a file comes from');
});

check(
  'a card from the far end of the pool reaches a row on a narrow screen',
  async (page) => {
    // Below the three-column breakpoint the pool goes back under the board, and
    // a drag out of it travels up through the pool's own scroll container.
    // dnd-kit auto-scrolls the scroll ancestors of the dragged card, and that
    // container is one of them: scrolling it re-virtualises the grid, unmounts
    // the card being dragged, and the drag dies with no highlight and no drop.
    // This is the only check that reaches the arrangement where that matters.
    await importLibrary(page, ratingsCsv(manyFilms(120)));
    const scroller = page.locator('section[aria-label="Pool"] .overflow-y-auto');
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.waitForTimeout(500);

    const last = await page.evaluate(() =>
      [...document.querySelectorAll('section[aria-label="Pool"] [aria-roledescription]')]
        .at(-1)
        ?.textContent.trim(),
    );
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    // Whichever row is on screen above the pool and clear of the band at the
    // top of the window where dnd-kit auto-scrolls the page, rather than a row
    // named here.
    //
    // Both halves are load-bearing. Which rows are in view on a narrow screen
    // depends on font metrics and scrollbar widths, which differ between a
    // laptop and a runner, so naming one passes in one place and fails in the
    // other for reasons that have nothing to do with the defect. And aiming
    // into the auto-scroll band moves the page under the aim: a row picked
    // there was measured landing its film in the row above, which is dnd-kit
    // doing exactly what it should and this check reading it as a failure.
    const target = await page.evaluate(() => {
      const pool = document.querySelector('section[aria-label="Pool"]').getBoundingClientRect();
      for (const list of document.querySelectorAll('ul[aria-label]')) {
        const label = list.getAttribute('aria-label');
        if (!label || !/\d+ films?$/.test(label)) continue;
        const box = list.getBoundingClientRect();
        if (box.top > innerHeight * 0.3 && box.bottom < pool.top - 10) {
          return label.split(' — ')[0];
        }
      }
      return null;
    });
    if (!target) throw new Error('no tier row is reachable above the pool at this size');

    await drag(page, poolCard(page, last), rowList(page, target));

    // That it reached *a* row, not that it reached this one. The defect this
    // guards is a drag that dies: the pool's grid re-virtualises mid-drag, the
    // dragged card is unmounted, the pointer capture goes with it and nothing
    // is dropped anywhere. Which row catches it is dnd-kit's business, and it
    // legitimately differs — the page auto-scrolls while a card is held near
    // the top of the window, and how far depends on how quickly the machine
    // gets through the frames. Pinning the row made this pass here and fail on
    // a runner twice.
    const after = await rows(page);
    const landed = Object.entries(after).find(([, films]) => films.includes(last))?.[0];
    if (!landed) {
      throw new Error(
        `${last} was dragged out of a narrow pool towards row ${target} and reached no row at all; ` +
          `the board last said: "${await announcement(page)}"`,
      );
    }
  },
  { width: 900, height: 800 },
);

check('a long row name is centred and stays inside its block', async (page) => {
  // The block is sized for the letters S through F. A name of any length has
  // to fit the same column: `justify-center` centres the block's line box and
  // does nothing about the lines inside it once a label wraps, so a long name
  // came out ragged-left — and an unbroken word ran sixty-one pixels past the
  // colour, over the row beside it.
  await importLibrary(page);
  await page.getByRole('button', { name: 'Edit rows' }).click();
  await page.waitForTimeout(300);

  const names = ['Chefs-d’œuvre absolus', 'AAAAAAAAAAAAAAAAAAAA'];
  const inputs = page.locator('input[id$="-label"]');
  for (const [index, name] of names.entries()) {
    await inputs.nth(index).fill('');
    await inputs.nth(index).type(name, { delay: 5 });
  }
  await page.getByRole('button', { name: 'Done editing rows' }).click();
  await page.waitForTimeout(400);

  const blocks = (await labelBlocks(page)).filter(Boolean);
  if (blocks.length !== 6)
    throw new Error(`expected six row blocks, found ${String(blocks.length)}`);

  for (const name of names) {
    const block = blocks.find((candidate) => candidate.text === name);
    if (!block) throw new Error(`no row block reads "${name}": ${JSON.stringify(blocks)}`);
    if (block.align !== 'center') throw new Error(`"${name}" is aligned ${block.align}`);
    if (block.overflow > 0)
      throw new Error(`"${name}" overflows its block by ${String(block.overflow)}px`);
  }

  // And the default letters keep the size the column is shaped for.
  const letter = blocks.find((candidate) => candidate.text === 'C');
  if (!letter) throw new Error('the untouched rows lost their letters');
});

check(
  'a finger drags a film into a row',
  async (page) => {
    // The app rendered correctly on a phone and could not be used on one. A
    // touch that reached dnd-kit's PointerSensor activated the drag, then the
    // browser claimed the same gesture as a page scroll and cancelled it —
    // "Moving Alpha was cancelled", every time, with the film back where it
    // started. A MouseSensor for the mouse and a TouchSensor with a hold for
    // the finger separate the two gestures.
    await importLibrary(page);
    await touchDrag(page, poolCard(page, 'Alpha'), rowList(page, 'S'));
    eq((await rows(page)).S, ['Alpha'], 'after a finger drags Alpha to S');
  },
  { width: 420, height: 2200, touch: true },
);

check(
  'a finger that moves at once does not drag, and cards leave scrolling alone',
  async (page) => {
    // The other half of the same choice, and the reason the fix is not simply
    // `touch-action: none` on every card: the pool is a wall of cards, so if a
    // touch starting on one could never scroll, the pool could not be scrolled
    // by finger at all. A swipe shorter than the sensor's delay must move no
    // film, and the card must leave the browser's panning alone.
    //
    // The scroll itself is asserted through `touch-action` rather than by
    // reading scrollY: CDP dispatches touch *events*, and Chrome does not turn
    // those into a compositor pan, so no synthetic swipe here scrolls anything
    // however the app is written. What is checkable is the property that
    // decides whether a real finger's swipe scrolls, and it is exactly the one
    // a well-meant fix would break.
    await importLibrary(page);
    const card = poolCard(page, 'Alpha');
    await touchSwipe(page, card, -260);
    eq((await rows(page)).S, [], 'after a swipe from a card');

    const panning = await card.evaluate((element) => {
      for (let node = element; node; node = node.parentElement) {
        if (getComputedStyle(node).touchAction === 'none') return node.className || node.tagName;
      }
      return null;
    });
    if (panning !== null) {
      throw new Error(`a card ancestor sets touch-action: none, so a finger cannot scroll from it (${panning})`);
    }
  },
  { width: 420, height: 900, touch: true },
);

check(
  'a phone shows the top of the board without scrolling',
  async (page) => {
    // Measured, not guessed: the library summary, the filter button, the board
    // bar, the toolbar and the pre-fill panel used to stack to about seven
    // hundred pixels, so an 844-pixel phone opened on one row and a sliver of
    // the next. Everything that is not ranking a film now folds behind "Board
    // tools" below `sm`.
    await importLibrary(page);

    const visibleRows = await page.evaluate(() =>
      [...document.querySelectorAll('ul[aria-label]')]
        .filter((list) => /\d+ films?$/.test(list.getAttribute('aria-label') ?? ''))
        .filter((list) => {
          const box = list.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= innerHeight;
        }).length,
    );
    if (visibleRows < 3) {
      throw new Error(`only ${String(visibleRows)} rows fit on a phone screen without scrolling`);
    }

    // Folded away, and reachable — a control that is hidden and stays hidden
    // is worse than one that costs a scroll.
    const png = page.getByRole('button', { name: 'Save as PNG' });
    if (await png.isVisible()) throw new Error('the export button is not folded away on a phone');
    await page.getByRole('button', { name: 'Board tools' }).click();
    await page.waitForTimeout(200);
    if (!(await png.isVisible())) throw new Error('"Board tools" did not reveal the export button');
    for (const name of ['New board', 'Duplicate', 'Edit rows', 'Pre-fill from my ratings']) {
      if (!(await page.getByRole('button', { name }).isVisible())) {
        throw new Error(`"Board tools" left ${name} hidden`);
      }
    }
  },
  { width: 390, height: 844 },
);

let failed = 0;
for (const { name, run, viewport } of checks) {
  const { browser, page, errors } = await open(viewport);
  try {
    await run(page);
    if (errors.length > 0) throw new Error(`console errors: ${errors.slice(0, 3).join(' | ')}`);
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${error.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

console.log(`\n${String(checks.length - failed)}/${String(checks.length)} passed`);
process.exit(failed === 0 ? 0 : 1);
