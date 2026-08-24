# End-to-end checks

Drag and drop is pointer events and layout. jsdom has neither — it reports
every element as 0×0, so dnd-kit's sensors cannot activate under it and no drag
can be driven at all. Everything in `npm run test:run` therefore tests the
_rules_ a drag obeys; nothing there tests a drag.

These checks drive a real Chromium. Every one of them exists because it caught
something a unit test could not reach, and the comment on each says what, so
that a check which stops discriminating is recognisable as such rather than
kept for its green tick. Where a check can no longer reproduce the defect it
was written for, it says so.

## Running them

Playwright is not a dependency of this project: installing it downloads a
browser, which is a large cost to put on every `npm install` and every CI run
for a suite that is not part of the gate. Install it when you want to run these.

```bash
npm install --no-save playwright
npx playwright install chromium

npm run dev            # in another terminal
npm run e2e
```

Against the production build instead of the dev server:

```bash
npm run build
npx vite preview --port 4173
CINETIER_URL=http://localhost:4173/ npm run e2e
```

Worth doing at least once before shipping: the dev build runs React in
development mode, with StrictMode double-rendering, and is roughly twice as
slow. Anything you conclude about performance from the dev server is wrong.

`CHROMIUM_PATH` overrides the browser binary, for a machine that already has
one Playwright's pinned revision does not match.

## What they do not cover

- A real screen reader. What is asserted is the text dnd-kit puts in the live
  region, which is what a screen reader would read, not the reading itself.
- Touch. Every drag here is a mouse.
- CI. These run by hand; the gate is still `npm run test:run`, `lint`,
  `typecheck` and `build`.
