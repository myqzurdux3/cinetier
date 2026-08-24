# Contributing to Cinetier

Thanks for your interest. Bug reports, fixture files from real exports, and
accessibility fixes are especially welcome.

## Getting started

```bash
npm install
cp .env.example .env.local   # add a free TMDB key
npm run dev
```

## Ground rules

- **Tests come first.** Write a failing test, then the code that passes it.
  Pull requests that change behaviour without a test will be asked for one.
- **Keep the layers clean.** `domain/` and `parsers/` must not import React, use
  `fetch`, or touch storage. ESLint enforces this; do not disable the rule.
- **Conventional Commits**, for example `feat(domain): add runtime filter`.
  Allowed scopes are listed in `commitlint.config.js`.
- **Never commit a `.env` file or an API key.**

## Before opening a pull request

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
```

CI runs those, and a second job that drives the board in a real browser. Drag
and drop is pointer events and layout, and jsdom has neither — it reports every
element as 0x0 — so nothing above tests a drag. To run those yourself before
opening a pull request:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run dev            # in another terminal
npm run e2e
```

## Adding a new import source

Add a parser under `src/parsers/` that returns `ParseResult`, with a fixture
file under `tests/fixtures/` and tests covering a normal file, a file missing a
required column, and a malformed row. Nothing outside `src/parsers/` should need
to change.
