# Cinetier Foundations & Data Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the public repository with working CI and deployment, and build the fully tested, framework-free data core that turns IMDb and Letterboxd exports into one unified, filterable, rankable film library.

**Architecture:** A layered browser application. This plan builds the two innermost layers only: `parsers/` (pure functions from exported file content to `Film[]`) and `domain/` (rating normalization, deduplication, filtering, tier assignment). Neither layer imports React, touches the network, or reads the filesystem, so every rule in this plan is verified by fast unit tests with no browser. Later plans add `services/` and `ui/` on top without modifying anything built here.

**Tech Stack:** TypeScript (strict), Vite, React 19, Tailwind CSS v4, Vitest, ESLint, Prettier, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-18-cinetier-design.md`

## Global Constraints

- **Repository is public.** Never commit `.env`, `.env.local`, or any file containing the TMDB key. `.gitignore` already covers these — verify before every commit.
- **`domain/` and `parsers/` must not import from `ui/` or `services/`.** No React, no `fetch`, no `localStorage`, no `window`. This is enforced by an ESLint rule in Task 1.
- **TypeScript `strict: true`.** No `any` in committed code. Use `unknown` plus narrowing.
- **Ratings are stored normalized to 0–100 internally** and rendered back in the source scale (`imdb10` or `letterboxd5`). No component may store a raw 1–10 or 0.5–5 value in a `Film`.
- **Conventional Commits** for every commit: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`, `ci:`.
- **Tests are written before implementation.** Every task follows red → green → commit.
- **Repository language is English** — code, comments, commits, documentation, and UI copy.
- **Node.js 22 or newer** (development machine runs v26.5.0).

---

## File Structure

```
.github/workflows/ci.yml          Typecheck, lint, test, build on every push and PR
.github/workflows/deploy.yml      Build and publish to GitHub Pages on main
.github/dependabot.yml            Weekly dependency updates
.github/ISSUE_TEMPLATE/*.yml      Structured bug and feature forms
.github/pull_request_template.md  Pull request checklist
README.md                         Project front page
CONTRIBUTING.md                   How to work on the project
CODE_OF_CONDUCT.md                Contributor Covenant 2.1
SECURITY.md                       Vulnerability reporting and threat model
CHANGELOG.md                      Keep a Changelog format
LICENSE                           MIT
commitlint.config.js              Conventional Commits enforcement
.lintstagedrc.json                Format and lint staged files
eslint.config.js                  Flat config, including the layer-boundary rule
vite.config.ts                    Vite + Tailwind + Vitest configuration
tsconfig.json                     Strict TypeScript
index.html                        Application shell
src/main.tsx                      React entry point
src/App.tsx                       Placeholder screen (replaced in plan 2)
src/index.css                     Tailwind import and theme tokens
src/domain/film.ts                The Film type and its factory helpers
src/domain/rating.ts              Scale conversion, both directions
src/domain/normalize.ts           Title normalization for matching
src/domain/dedupe.ts              Merging libraries from two services
src/domain/filters.ts             Every filter predicate and their combination
src/domain/tiers.ts               Tier definitions and threshold assignment
src/parsers/types.ts              ParseResult and ParseError shared by parsers
src/parsers/imdb.ts               IMDb ratings.csv -> Film[]
src/parsers/letterboxd.ts         Letterboxd export CSVs -> Film[]
tests/fixtures/imdb-ratings.csv        Anonymized 6-row IMDb export
tests/fixtures/letterboxd-diary.csv    Anonymized 5-row diary
tests/fixtures/letterboxd-ratings.csv  Anonymized 5-row ratings
tests/fixtures/letterboxd-watched.csv  Anonymized 6-row watched list
```

Files are split by responsibility, not by technical layer: `rating.ts` owns everything about scales, `tiers.ts` owns everything about tier boundaries. A change to how half-stars round touches exactly one file.

---

### Task 1: Project scaffold, tooling, and continuous integration

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `.env.example`
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/dependabot.yml`
- Verify: `.gitignore` (already exists)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run dev`, `npm run build`, `npm run test`, `npm run test:run`, `npm run lint`, `npm run typecheck`. All later tasks rely on `npm run test:run` and the `@/` path alias resolving to `src/`.

- [ ] **Step 1: Initialize the package and install dependencies**

```bash
npm init -y
npm install react react-dom papaparse
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  @types/papaparse tailwindcss @tailwindcss/vite vitest @vitest/coverage-v8 \
  eslint @eslint/js typescript-eslint eslint-plugin-react-hooks \
  eslint-plugin-import prettier
```

Installing without pinned version numbers is deliberate: npm resolves the current stable releases rather than versions frozen into this document.

- [ ] **Step 2: Replace the generated `package.json` scripts and metadata**

Edit `package.json` so these fields read exactly as follows, leaving the generated `dependencies` and `devDependencies` blocks untouched:

```json
{
  "name": "cinetier",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Turn your IMDb or Letterboxd history into a tier list, entirely in your browser.",
  "license": "MIT",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc -b --noEmit"
  }
}
```

- [ ] **Step 3: Create the TypeScript configuration**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "tests"]
}
```

`noUncheckedIndexedAccess` matters here: CSV parsing indexes into arrays constantly, and this setting forces the code to acknowledge that a column might be missing rather than crashing on a malformed export.

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // GitHub Pages serves the project at /cinetier/, local dev at /.
  base: process.env.GITHUB_ACTIONS ? '/cinetier/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/domain/**', 'src/parsers/**'] },
  },
});
```

The `test.environment` is `node`, not `jsdom`: the domain and parser layers have no DOM dependency, and node is considerably faster. Plan 2 adds a separate jsdom project for component tests.

- [ ] **Step 5: Create the ESLint flat config with the layer-boundary rule**

`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The architectural rule from the spec, enforced rather than documented.
    files: ['src/domain/**/*.ts', 'src/parsers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/ui/*', '@/services/*', 'react', 'react-dom'],
              message: 'domain/ and parsers/ must stay free of UI and I/O dependencies.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'domain/ and parsers/ must not touch the DOM.' },
        { name: 'fetch', message: 'Network access belongs in services/.' },
        { name: 'localStorage', message: 'Storage access belongs in services/.' },
      ],
    },
  },
);
```

- [ ] **Step 6: Create `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

- [ ] **Step 7: Create the application shell**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cinetier — Turn your film history into a tier list</title>
    <meta name="description" content="Import your IMDb or Letterboxd history and rank it. Runs entirely in your browser." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@import 'tailwindcss';

@theme {
  --color-screen: #0a0a0b;
  --color-surface: #141417;
  --color-accent: #e8b44a;
  --color-tier-s: #e05263;
  --color-tier-a: #e8834a;
  --color-tier-b: #e8b44a;
  --color-tier-c: #8bc34a;
  --color-tier-d: #4a9de8;
  --color-tier-f: #7a7a85;
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx` — a deliberate placeholder, replaced in plan 2:

```tsx
export default function App() {
  return (
    <main className="min-h-screen bg-screen text-white flex items-center justify-center">
      <h1 className="text-4xl font-semibold tracking-tight">Cinetier</h1>
    </main>
  );
}
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

`.env.example` — committed, and the reason the real key never needs to be:

```
# Get a free API key at https://www.themoviedb.org/settings/api
# This value ships in the client bundle by design; it is a public read-only key.
VITE_TMDB_API_KEY=your_key_here
```

- [ ] **Step 8: Verify the toolchain runs**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all three succeed, and `dist/` is created.

- [ ] **Step 9: Create the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:run
      - run: npm run build
```

- [ ] **Step 10: Create the deployment workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_TMDB_API_KEY: ${{ secrets.TMDB_API_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 11: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    groups:
      dev-dependencies:
        dependency-type: development
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
```

- [ ] **Step 12: Confirm no secret is stageable, then commit**

```bash
git status --short
git check-ignore -v .env.local
git add -A
git status --short   # confirm .env.local is absent from the staged list
git commit -m "chore: scaffold Vite + React + TypeScript project with CI and Pages deploy"
```

The `git status --short` after staging is not ceremony. It is the last moment to catch a secret before it enters history in a public repository.

---

### Task 2: Repository documentation, commit hygiene, and going public

The repository becomes publicly visible in this task. Everything a visitor judges the project by — the README, the licence, the contribution guide — must exist *before* that happens, not after.

**Files:**
- Create: `LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/pull_request_template.md`
- Create: `commitlint.config.js`, `.lintstagedrc.json`, `.husky/commit-msg`, `.husky/pre-commit`

**Interfaces:**
- Consumes: the working `npm run lint`, `npm run typecheck`, and `npm run build` scripts from Task 1.
- Produces: a public repository at `github.com/<owner>/cinetier` with `origin` configured, the `TMDB_API_KEY` secret registered, and GitHub Pages serving from Actions. Every later task pushes to this remote.

- [ ] **Step 1: Install commit tooling**

```bash
npm install -D @commitlint/cli @commitlint/config-conventional husky lint-staged
npx husky init
```

`npx husky init` creates `.husky/` and adds a `prepare` script to `package.json` so hooks install automatically for anyone who clones the repository.

- [ ] **Step 2: Configure commitlint and lint-staged**

`commitlint.config.js`:

```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['domain', 'parsers', 'services', 'ui', 'deps', 'ci', 'docs'],
    ],
  },
};
```

`.lintstagedrc.json`:

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css,yml,yaml}": ["prettier --write"]
}
```

`.husky/commit-msg`:

```sh
npx --no -- commitlint --edit "$1"
```

`.husky/pre-commit`:

```sh
npx lint-staged
```

- [ ] **Step 3: Write the licence**

`LICENSE` — the MIT licence, with `<YEAR>` replaced by `2026` and `<COPYRIGHT HOLDER>` by `Cinetier contributors`. Copy the canonical text from https://opensource.org/license/mit; do not paraphrase it, as a modified licence is no longer MIT.

- [ ] **Step 4: Write the README**

`README.md`. This is the project's front page, so it leads with what the thing does and who it is for, not with installation instructions:

````markdown
<div align="center">

# Cinetier

**Turn your film history into a tier list.**

Import your IMDb or Letterboxd data, filter it however you like, and rank it.
Everything runs in your browser — no account, no upload, no server.

[Open Cinetier](https://<owner>.github.io/cinetier/)

</div>

---

## What it does

You have rated hundreds of films on IMDb or Letterboxd. Cinetier turns that
history into a tier list you can share.

- **Import your own data.** Drop in an IMDb `ratings.csv` or a Letterboxd
  export `.zip`, exactly as those services give it to you.
- **Filter before you rank.** Only films you watched this year. Only those you
  rated above four stars. Only 1980s horror under 100 minutes. Only the ones you
  liked far more than everyone else did.
- **Start from your ratings, or from nothing.** Cinetier pre-fills the tiers
  from the scores you already gave, and you drag from there — or empty the board
  and rank entirely by hand.
- **Export a PNG** to share, and keep as many saved tier lists as you like.

## Privacy

Your ratings never leave your browser. There is no server and no account.
Films are stored locally, and the only outbound requests are to TMDB, which
receive a title, year, or IMDb identifier in order to fetch a poster — never
your ratings and never your history.

## Getting your data

**IMDb** — Your Ratings page > the three-dot menu > Export. You will receive
`ratings.csv` by email or download.

**Letterboxd** — Settings > Data > Export your data. Upload the `.zip` as it is;
Cinetier unpacks it for you.

Because IMDb does not export watch dates, Cinetier uses your rating date instead
for IMDb imports, and labels it as such. Letterboxd diary entries carry real
watch dates.

## Running it locally

```bash
git clone https://github.com/<owner>/cinetier.git
cd cinetier
npm install
cp .env.example .env.local   # then add a free TMDB API key
npm run dev
```

Get a TMDB key at https://www.themoviedb.org/settings/api. The key is read-only
and ships in the client bundle by design — this application has no backend to
hide it behind.

## Development

```bash
npm run test        # watch mode
npm run test:run    # single run
npm run lint
npm run typecheck
npm run build
```

Architecture is layered: `parsers/` turns exported files into a unified `Film`
model, `domain/` holds every rule worth testing as pure TypeScript, `services/`
owns the only network and storage access, and `ui/` renders. `domain/` and
`parsers/` import nothing from the outer layers, which is enforced by ESLint.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Licence

MIT. See [LICENSE](LICENSE).

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.

Cinetier is not affiliated with, endorsed by, or connected to IMDb or Letterboxd.
````

Replace `<owner>` with the actual GitHub account name in all four places.

- [ ] **Step 5: Write the contribution and conduct documents**

`CONTRIBUTING.md`:

```markdown
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

## Adding a new import source

Add a parser under `src/parsers/` that returns `ParseResult`, with a fixture
file under `tests/fixtures/` and tests covering a normal file, a file missing a
required column, and a malformed row. Nothing outside `src/parsers/` should need
to change.
```

`CODE_OF_CONDUCT.md`: use the Contributor Covenant version 2.1, copied verbatim from https://www.contributor-covenant.org/version/2/1/code_of_conduct/, with the contact address filled in.

`SECURITY.md`:

```markdown
# Security Policy

## Reporting a vulnerability

Please report security issues through GitHub's private vulnerability reporting
(the Security tab of this repository) rather than in a public issue.

## Scope

Cinetier runs entirely in the browser and has no backend. It stores your film
library locally and sends only a title, year, or IMDb identifier to TMDB in
order to fetch posters.

The TMDB API key present in the built JavaScript is intentional, not a leak: a
client-side application has no server in which to hide it. It is a read-only,
rate-limited key. Reports about its visibility will be closed as by design.
```

- [ ] **Step 6: Add issue and pull request templates**

`.github/ISSUE_TEMPLATE/bug_report.yml`:

```yaml
name: Bug report
description: Something behaved incorrectly
labels: [bug]
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: What you expected, and what happened instead.
    validations:
      required: true
  - type: dropdown
    id: source
    attributes:
      label: Which import source?
      options: [IMDb, Letterboxd, Both, Not related to importing]
    validations:
      required: true
  - type: textarea
    id: reproduce
    attributes:
      label: Steps to reproduce
    validations:
      required: true
  - type: input
    id: browser
    attributes:
      label: Browser and version
  - type: checkboxes
    id: privacy
    attributes:
      label: Before submitting
      options:
        - label: I have removed any personal data from files and screenshots I attach.
          required: true
```

`.github/ISSUE_TEMPLATE/feature_request.yml`:

```yaml
name: Feature request
description: Suggest an improvement
labels: [enhancement]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem would this solve?
      description: Describe the situation, not only the solution you have in mind.
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: What would you like to happen?
    validations:
      required: true
```

`.github/pull_request_template.md`:

```markdown
## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## How it was verified

<!-- Which tests were added or run. -->

## Checklist

- [ ] Tests were written before the implementation and cover the change
- [ ] `npm run typecheck && npm run lint && npm run test:run && npm run build` passes
- [ ] No secret, `.env` file, or personal export data is included
- [ ] `domain/` and `parsers/` remain free of UI and I/O imports
```

- [ ] **Step 7: Start the changelog**

`CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffold, continuous integration, and GitHub Pages deployment.
```

- [ ] **Step 8: Verify the hooks actually fire**

```bash
git add -A
git commit -m "bad message"
```

Expected: the commit is **rejected** by commitlint with "subject may not be empty" or "type may not be empty". This proves the hook is active. Then commit properly:

```bash
git commit -m "docs: add README, licence, and contribution guidelines"
```

Expected: succeeds, with lint-staged formatting the staged files first.

- [ ] **Step 9: Confirm no secret is stageable, then create the public repository**

```bash
git status --short
# Search history for the key VALUE, not its name: .env.example legitimately
# contains the variable name and would otherwise always match.
git log -p | grep -cF "$(sed -n 's/^VITE_TMDB_API_KEY=//p' .env.local)" || echo "0 — clean"
gh repo create cinetier --public --source=. --remote=origin \
  --description "Turn your IMDb or Letterboxd history into a tier list, entirely in your browser." \
  --push
```

A non-zero count means the key value reached git history (`grep -c` exits 1 and prints "0 — clean" when there is no match, which is the outcome you want). Stop and rewrite history before pushing; a secret pushed to a public repository must be considered compromised and rotated at TMDB.

- [ ] **Step 10: Register the TMDB key as a repository secret and enable Pages**

```bash
gh secret set TMDB_API_KEY < <(sed -n 's/^VITE_TMDB_API_KEY=//p' .env.local)
gh api -X POST "repos/{owner}/{repo}/pages" -f build_type=workflow 2>/dev/null \
  || gh api -X PUT "repos/{owner}/{repo}/pages" -f build_type=workflow
```

The second command tolerates Pages already being enabled.

- [ ] **Step 11: Set the repository topics and homepage**

```bash
gh repo edit --homepage "https://$(gh api user --jq .login).github.io/cinetier/" \
  --add-topic tier-list --add-topic letterboxd --add-topic imdb \
  --add-topic movies --add-topic react --add-topic typescript
```

- [ ] **Step 12: Verify both workflows pass and the site is live**

```bash
gh run watch
```

Expected: CI green, deploy green, and `https://<owner>.github.io/cinetier/` showing the word "Cinetier". Confirm in a browser before continuing — a deployment pipeline proven now costs minutes, while one discovered broken at task 20 costs hours of bisecting.

---

### Task 3: Rating scale conversion

**Files:**
- Create: `src/domain/rating.ts`
- Test: `tests/domain/rating.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type RatingScale = 'imdb10' | 'letterboxd5'`
  - `normalizeRating(raw: number, scale: RatingScale): number` — returns 0–100
  - `denormalizeRating(normalized: number, scale: RatingScale): number` — returns a value in the original scale
  - `formatRating(normalized: number, scale: RatingScale): string` — human-facing, e.g. `"8/10"` or `"★★★★☆"`

- [ ] **Step 1: Write the failing tests**

`tests/domain/rating.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeRating, denormalizeRating, formatRating } from '@/domain/rating';

describe('normalizeRating', () => {
  it('maps the IMDb scale onto 0-100', () => {
    expect(normalizeRating(10, 'imdb10')).toBe(100);
    expect(normalizeRating(8, 'imdb10')).toBe(80);
    expect(normalizeRating(1, 'imdb10')).toBe(10);
  });

  it('maps the Letterboxd scale onto 0-100', () => {
    expect(normalizeRating(5, 'letterboxd5')).toBe(100);
    expect(normalizeRating(3.5, 'letterboxd5')).toBe(70);
    expect(normalizeRating(0.5, 'letterboxd5')).toBe(10);
  });

  it('rejects values outside the scale rather than silently clamping', () => {
    expect(() => normalizeRating(11, 'imdb10')).toThrow(/out of range/i);
    expect(() => normalizeRating(0, 'letterboxd5')).toThrow(/out of range/i);
  });
});

describe('denormalizeRating', () => {
  it('round-trips every valid IMDb rating', () => {
    for (let r = 1; r <= 10; r += 1) {
      expect(denormalizeRating(normalizeRating(r, 'imdb10'), 'imdb10')).toBe(r);
    }
  });

  it('round-trips every valid Letterboxd rating', () => {
    for (let r = 0.5; r <= 5; r += 0.5) {
      expect(denormalizeRating(normalizeRating(r, 'letterboxd5'), 'letterboxd5')).toBe(r);
    }
  });

  it('snaps a cross-scale value to the nearest step of the target scale', () => {
    // 75/100 is not expressible in half-stars; 3.5 and 4 are the neighbours.
    expect(denormalizeRating(75, 'letterboxd5')).toBe(4);
    expect(denormalizeRating(74, 'letterboxd5')).toBe(3.5);
  });
});

describe('formatRating', () => {
  it('renders the IMDb scale as a mark out of ten', () => {
    expect(formatRating(80, 'imdb10')).toBe('8/10');
  });

  it('renders the Letterboxd scale as stars, including a half star', () => {
    expect(formatRating(70, 'letterboxd5')).toBe('★★★½');
    expect(formatRating(100, 'letterboxd5')).toBe('★★★★★');
  });
});
```

The round-trip tests are the important ones. They are what guarantee a Letterboxd user never sees their 3½ stars come back as 3.4999.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- tests/domain/rating.test.ts`
Expected: FAIL, "Failed to resolve import '@/domain/rating'".

- [ ] **Step 3: Write the implementation**

`src/domain/rating.ts`:

```ts
export type RatingScale = 'imdb10' | 'letterboxd5';

interface ScaleDefinition {
  min: number;
  max: number;
  step: number;
}

const SCALES: Record<RatingScale, ScaleDefinition> = {
  imdb10: { min: 1, max: 10, step: 1 },
  letterboxd5: { min: 0.5, max: 5, step: 0.5 },
};

/** Convert a rating in its native scale to the internal 0-100 representation. */
export function normalizeRating(raw: number, scale: RatingScale): number {
  const { min, max } = SCALES[scale];
  if (!Number.isFinite(raw) || raw < min || raw > max) {
    throw new RangeError(`Rating ${raw} is out of range for scale ${scale} (${min}-${max}).`);
  }
  // Round to two decimals: (8.7 / 10) * 100 is 87.00000000000001 in binary
  // floating point, and a rating that fails an equality check is a rating bug.
  return Math.round((raw / max) * 10000) / 100;
}

/** Convert an internal 0-100 rating back to the nearest valid value in the target scale. */
export function denormalizeRating(normalized: number, scale: RatingScale): number {
  const { max, step } = SCALES[scale];
  const exact = (normalized / 100) * max;
  const snapped = Math.round(exact / step) * step;
  // Guard against binary floating point residue such as 3.5000000000000004.
  return Number(snapped.toFixed(1));
}

/** Render a rating for display in its source scale. */
export function formatRating(normalized: number, scale: RatingScale): string {
  const value = denormalizeRating(normalized, scale);
  if (scale === 'imdb10') return `${value}/10`;
  const full = Math.floor(value);
  return '★'.repeat(full) + (value % 1 === 0.5 ? '½' : '');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- tests/domain/rating.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/rating.ts tests/domain/rating.test.ts
git commit -m "feat(domain): add rating scale normalization and formatting"
```

---

### Task 4: The Film type and title normalization

**Files:**
- Create: `src/domain/film.ts`, `src/domain/normalize.ts`
- Test: `tests/domain/normalize.test.ts`

**Interfaces:**
- Consumes: `RatingScale` from Task 3.
- Produces:
  - `interface Film` — the unified record every parser emits
  - `normalizeTitle(title: string): string`
  - `matchKey(film: Pick<Film, 'imdbId' | 'title' | 'year'>): string`

- [ ] **Step 1: Write the failing tests**

`tests/domain/normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTitle, matchKey } from '@/domain/normalize';

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle('Spider-Man: No Way Home')).toBe('spider man no way home');
  });

  it('strips diacritics so accented titles match across services', () => {
    expect(normalizeTitle('Amélie')).toBe('amelie');
    expect(normalizeTitle('La Haine')).toBe('la haine');
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeTitle('  Blade   Runner  ')).toBe('blade runner');
  });

  it('keeps digits, which distinguish sequels', () => {
    expect(normalizeTitle('Blade Runner 2049')).toBe('blade runner 2049');
  });
});

describe('matchKey', () => {
  it('prefers the IMDb identifier when present', () => {
    expect(matchKey({ imdbId: 'tt0133093', title: 'The Matrix', year: 1999 })).toBe('imdb:tt0133093');
  });

  it('falls back to normalized title and year', () => {
    expect(matchKey({ imdbId: null, title: 'The Matrix', year: 1999 })).toBe('title:the matrix::1999');
  });

  it('distinguishes remakes released in different years', () => {
    const original = matchKey({ imdbId: null, title: 'Dune', year: 1984 });
    const remake = matchKey({ imdbId: null, title: 'Dune', year: 2021 });
    expect(original).not.toBe(remake);
  });

  it('handles a missing year without collapsing unrelated films', () => {
    expect(matchKey({ imdbId: null, title: 'Dune', year: null })).toBe('title:dune::unknown');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- tests/domain/normalize.test.ts`
Expected: FAIL, "Failed to resolve import '@/domain/normalize'".

- [ ] **Step 3: Write `src/domain/film.ts`**

```ts
import type { RatingScale } from './rating';

export type FilmSource = 'imdb' | 'letterboxd';

/**
 * One film in the user's library, normalized across services.
 * Every parser produces this shape; nothing downstream knows where it came from.
 */
export interface Film {
  /** Stable identity: "imdb:tt0133093", "lb:the-matrix", or "tmdb:603". */
  id: string;
  imdbId: string | null;
  tmdbId: number | null;
  title: string;
  year: number | null;
  /** Normalized 0-100, or null when the film was watched but not rated. */
  rating: number | null;
  /** The scale this rating was originally expressed in, for display. */
  ratingScale: RatingScale;
  watchedAt: Date | null;
  /**
   * True when watchedAt is really a "date rated" standing in for a watch date.
   * IMDb does not export watch dates; the UI must say so rather than imply precision.
   */
  watchedAtIsApproximate: boolean;
  isRewatch: boolean;
  genres: string[];
  directors: string[];
  runtimeMinutes: number | null;
  /** Normalized 0-100 public rating, when the source provides one. */
  publicRating: number | null;
  posterPath: string | null;
  source: FilmSource;
}
```

- [ ] **Step 4: Write `src/domain/normalize.ts`**

```ts
import type { Film } from './film';

/**
 * Reduce a title to a comparable form: lowercase, unaccented, punctuation-free.
 * Used only for matching; the original title is always what gets displayed.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * The key used to decide whether two records describe the same film.
 * IMDb identifiers are authoritative; title and year are the fallback for
 * Letterboxd exports, which carry no cross-service identifier.
 */
export function matchKey(film: Pick<Film, 'imdbId' | 'title' | 'year'>): string {
  if (film.imdbId) return `imdb:${film.imdbId}`;
  return `title:${normalizeTitle(film.title)}::${film.year ?? 'unknown'}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- tests/domain/normalize.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/domain/film.ts src/domain/normalize.ts tests/domain/normalize.test.ts
git commit -m "feat(domain): add unified Film model and title matching keys"
```

---

### Task 5: IMDb parser

**Files:**
- Create: `src/parsers/types.ts`, `src/parsers/imdb.ts`
- Create: `tests/fixtures/imdb-ratings.csv`
- Test: `tests/parsers/imdb.test.ts`

**Interfaces:**
- Consumes: `Film` (Task 4), `normalizeRating` (Task 3).
- Produces:
  - `interface ParseResult { films: Film[]; skipped: number; warnings: string[] }`
  - `class ParseError extends Error { constructor(message: string, public readonly hint: string) }`
  - `parseImdbRatings(csvText: string): ParseResult`

- [ ] **Step 1: Create the fixture**

`tests/fixtures/imdb-ratings.csv` — a real export header with anonymized rows, including one TV entry that must be skipped and one unrated-style edge case:

```csv
Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0133093,9,2024-03-15,The Matrix,The Matrix,https://www.imdb.com/title/tt0133093/,Movie,8.7,136,1999,"Action, Sci-Fi",2000000,1999-03-31,"Lana Wachowski, Lilly Wachowski"
tt0110912,10,2023-11-02,Pulp Fiction,Pulp Fiction,https://www.imdb.com/title/tt0110912/,Movie,8.9,154,1994,"Crime, Drama",2200000,1994-10-14,Quentin Tarantino
tt0468569,8,2025-01-20,The Dark Knight,The Dark Knight,https://www.imdb.com/title/tt0468569/,Movie,9.0,152,2008,"Action, Crime, Drama",2900000,2008-07-18,Christopher Nolan
tt0903747,10,2024-06-01,Breaking Bad,Breaking Bad,https://www.imdb.com/title/tt0903747/,TV Series,9.5,49,2008,"Crime, Drama, Thriller",2100000,2008-01-20,
tt0087182,6,2022-08-09,Dune,Dune,https://www.imdb.com/title/tt0087182/,Movie,6.3,137,1984,"Action, Adventure, Sci-Fi",190000,1984-12-14,David Lynch
tt1160419,7,2025-02-14,Dune,Dune,https://www.imdb.com/title/tt1160419/,Movie,8.0,155,2021,"Action, Adventure, Drama",850000,2021-10-22,Denis Villeneuve
```

The two *Dune* rows are there on purpose: they prove the parser and the deduplicator keep a remake distinct from its original.

- [ ] **Step 2: Write the failing tests**

`tests/parsers/imdb.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseImdbRatings } from '@/parsers/imdb';
import { ParseError } from '@/parsers/types';

const fixture = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');

describe('parseImdbRatings', () => {
  it('parses every film row and skips non-film entries', () => {
    const result = parseImdbRatings(fixture);
    expect(result.films).toHaveLength(5);
    expect(result.skipped).toBe(1);
    expect(result.films.map((f) => f.title)).not.toContain('Breaking Bad');
  });

  it('maps all fields of a row onto the Film model', () => {
    const matrix = parseImdbRatings(fixture).films.find((f) => f.imdbId === 'tt0133093')!;
    expect(matrix).toMatchObject({
      id: 'imdb:tt0133093',
      title: 'The Matrix',
      year: 1999,
      rating: 90,
      ratingScale: 'imdb10',
      isRewatch: false,
      genres: ['Action', 'Sci-Fi'],
      directors: ['Lana Wachowski', 'Lilly Wachowski'],
      runtimeMinutes: 136,
      publicRating: 87,
      source: 'imdb',
      tmdbId: null,
      posterPath: null,
    });
  });

  it('flags the watch date as approximate, because IMDb exports only a rating date', () => {
    const matrix = parseImdbRatings(fixture).films.find((f) => f.imdbId === 'tt0133093')!;
    expect(matrix.watchedAt).toEqual(new Date('2024-03-15'));
    expect(matrix.watchedAtIsApproximate).toBe(true);
  });

  it('rejects a file missing a required column with an actionable hint', () => {
    const wrongFile = 'Position,Const,Created,Title\n1,tt0133093,2024-01-01,The Matrix';
    expect(() => parseImdbRatings(wrongFile)).toThrow(ParseError);
    try {
      parseImdbRatings(wrongFile);
    } catch (error) {
      expect((error as ParseError).message).toMatch(/Your Rating/);
      expect((error as ParseError).hint).toMatch(/ratings\.csv/);
    }
  });

  it('rejects an empty file', () => {
    expect(() => parseImdbRatings('')).toThrow(ParseError);
  });

  it('tolerates a malformed row without losing the rest of the file', () => {
    const withBadRow = `${fixture}\ntt9999999,not-a-number,,Broken Row,,,Movie,,,,,,,`;
    const result = parseImdbRatings(withBadRow);
    expect(result.films).toHaveLength(5);
    expect(result.warnings.join(' ')).toMatch(/Broken Row/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- tests/parsers/imdb.test.ts`
Expected: FAIL, "Failed to resolve import '@/parsers/imdb'".

- [ ] **Step 4: Write `src/parsers/types.ts`**

```ts
import type { Film } from '@/domain/film';

export interface ParseResult {
  films: Film[];
  /** Rows deliberately ignored, such as TV series in an IMDb export. */
  skipped: number;
  /** Non-fatal problems worth surfacing to the user. */
  warnings: string[];
}

/**
 * A failure that stops the whole import, carrying a hint that tells the user
 * what to do about it rather than only what went wrong.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly hint: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export function requireColumns(headers: string[], required: string[], hint: string): void {
  const present = new Set(headers.map((h) => h.trim().toLowerCase()));
  const missing = required.filter((column) => !present.has(column.toLowerCase()));
  if (missing.length > 0) {
    throw new ParseError(`This file is missing the column(s): ${missing.join(', ')}.`, hint);
  }
}
```

- [ ] **Step 5: Write `src/parsers/imdb.ts`**

```ts
import Papa from 'papaparse';
import type { Film } from '@/domain/film';
import { normalizeRating } from '@/domain/rating';
import { ParseError, requireColumns, type ParseResult } from './types';

const REQUIRED = ['Const', 'Your Rating', 'Title', 'Title Type', 'Year'];
const HINT = 'Export "Your Ratings" from IMDb and upload the ratings.csv file it produces.';

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | undefined): Date | null {
  if (!value || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Parse an IMDb "Your Ratings" CSV export into the unified Film model. */
export function parseImdbRatings(csvText: string): ParseResult {
  if (csvText.trim() === '') {
    throw new ParseError('This file is empty.', HINT);
  }

  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  requireColumns(parsed.meta.fields ?? [], REQUIRED, HINT);

  const films: Film[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const row of parsed.data) {
    const titleType = (row['Title Type'] ?? '').trim().toLowerCase();
    // IMDb exports include series, episodes, and shorts; a film tier list wants films.
    if (titleType !== 'movie' && titleType !== 'tvmovie') {
      skipped += 1;
      continue;
    }

    const imdbId = (row['Const'] ?? '').trim();
    const title = (row['Title'] ?? '').trim();
    const rawRating = parseNumber(row['Your Rating']);

    if (!imdbId || !title || rawRating === null) {
      warnings.push(`Skipped a row that could not be read: "${title || 'untitled'}".`);
      continue;
    }

    const publicRating = parseNumber(row['IMDb Rating']);

    films.push({
      id: `imdb:${imdbId}`,
      imdbId,
      tmdbId: null,
      title,
      year: parseNumber(row['Year']),
      rating: normalizeRating(rawRating, 'imdb10'),
      ratingScale: 'imdb10',
      watchedAt: parseDate(row['Date Rated']),
      // IMDb never exports a watch date. This is the date the user rated the film.
      watchedAtIsApproximate: true,
      isRewatch: false,
      genres: splitList(row['Genres']),
      directors: splitList(row['Directors']),
      runtimeMinutes: parseNumber(row['Runtime (mins)']),
      publicRating: publicRating === null ? null : normalizeRating(publicRating, 'imdb10'),
      posterPath: null,
      source: 'imdb',
    });
  }

  return { films, skipped, warnings };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:run -- tests/parsers/imdb.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add src/parsers/types.ts src/parsers/imdb.ts tests/parsers/imdb.test.ts tests/fixtures/imdb-ratings.csv
git commit -m "feat(parsers): parse IMDb ratings exports into the Film model"
```

---

### Task 6: Letterboxd parser

**Files:**
- Create: `src/parsers/letterboxd.ts`
- Create: `tests/fixtures/letterboxd-diary.csv`, `tests/fixtures/letterboxd-ratings.csv`, `tests/fixtures/letterboxd-watched.csv`
- Test: `tests/parsers/letterboxd.test.ts`

**Interfaces:**
- Consumes: `Film` (Task 4), `normalizeRating` (Task 3), `ParseResult`/`ParseError`/`requireColumns` (Task 5).
- Produces: `parseLetterboxdExport(files: LetterboxdFiles): ParseResult` where
  `interface LetterboxdFiles { diary?: string; ratings?: string; watched?: string }`

Letterboxd splits one history across three files, and they overlap. The diary is the richest source, ratings adds films rated without a diary entry, and watched adds films seen but never rated. Merging them correctly is the whole job of this task.

- [ ] **Step 1: Create the fixtures**

`tests/fixtures/letterboxd-diary.csv`:

```csv
Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2025-03-10,The Matrix,1999,https://boxd.it/1a2b,4.5,Yes,,2025-03-09
2025-01-05,Pulp Fiction,1994,https://boxd.it/2c3d,5,,,2025-01-04
2024-12-20,Amélie,2001,https://boxd.it/3e4f,4,,,2024-12-19
2024-11-11,Dune,2021,https://boxd.it/4g5h,3.5,,,2024-11-10
2024-09-02,Parasite,2019,https://boxd.it/5i6j,5,Yes,,2024-09-01
```

`tests/fixtures/letterboxd-ratings.csv`:

```csv
Date,Name,Year,Letterboxd URI,Rating
2025-03-10,The Matrix,1999,https://boxd.it/1a2b,4.5
2025-01-05,Pulp Fiction,1994,https://boxd.it/2c3d,5
2024-12-20,Amélie,2001,https://boxd.it/3e4f,4
2024-11-11,Dune,2021,https://boxd.it/4g5h,3.5
2023-05-18,Stalker,1979,https://boxd.it/7k8l,4.5
```

`tests/fixtures/letterboxd-watched.csv`:

```csv
Date,Name,Year,Letterboxd URI
2025-03-10,The Matrix,1999,https://boxd.it/1a2b
2025-01-05,Pulp Fiction,1994,https://boxd.it/2c3d
2024-12-20,Amélie,2001,https://boxd.it/3e4f
2024-11-11,Dune,2021,https://boxd.it/4g5h
2023-05-18,Stalker,1979,https://boxd.it/7k8l
2022-02-02,Solaris,1972,https://boxd.it/9m0n
```

Read together these describe seven distinct films. Four titles appear in all three files, *Parasite* appears only in the diary, *Stalker* was rated but never logged in the diary, and *Solaris* was watched without ever being rated.

- [ ] **Step 2: Write the failing tests**

`tests/parsers/letterboxd.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLetterboxdExport } from '@/parsers/letterboxd';
import { ParseError } from '@/parsers/types';

const files = {
  diary: readFileSync('tests/fixtures/letterboxd-diary.csv', 'utf8'),
  ratings: readFileSync('tests/fixtures/letterboxd-ratings.csv', 'utf8'),
  watched: readFileSync('tests/fixtures/letterboxd-watched.csv', 'utf8'),
};

describe('parseLetterboxdExport', () => {
  it('merges the three files into one entry per film', () => {
    const result = parseLetterboxdExport(files);
    expect(result.films).toHaveLength(7);
    const titles = result.films.map((f) => f.title).sort();
    expect(titles).toEqual([
      'Amélie', 'Dune', 'Parasite', 'Pulp Fiction', 'Solaris', 'Stalker', 'The Matrix',
    ]);
  });

  it('maps a diary entry onto the Film model with a precise watch date', () => {
    const matrix = parseLetterboxdExport(files).films.find((f) => f.title === 'The Matrix');
    expect(matrix).toMatchObject({
      id: 'lb:1a2b',
      title: 'The Matrix',
      year: 1999,
      rating: 90,
      ratingScale: 'letterboxd5',
      isRewatch: true,
      watchedAtIsApproximate: false,
      source: 'letterboxd',
      imdbId: null,
      genres: [],
      directors: [],
      runtimeMinutes: null,
      publicRating: null,
    });
    expect(matrix!.watchedAt).toEqual(new Date('2025-03-09'));
  });

  it('keeps a film that was rated but never logged in the diary', () => {
    const stalker = parseLetterboxdExport(files).films.find((f) => f.title === 'Stalker')!;
    expect(stalker.rating).toBe(90);
    expect(stalker.isRewatch).toBe(false);
  });

  it('keeps a watched film that was never rated', () => {
    const solaris = parseLetterboxdExport(files).films.find((f) => f.title === 'Solaris')!;
    expect(solaris.rating).toBeNull();
  });

  it('works from the diary alone', () => {
    const result = parseLetterboxdExport({ diary: files.diary });
    expect(result.films).toHaveLength(5);
  });

  it('rejects an export with no usable file', () => {
    expect(() => parseLetterboxdExport({})).toThrow(ParseError);
  });

  it('rejects a file whose columns do not match a Letterboxd export', () => {
    expect(() => parseLetterboxdExport({ ratings: 'Const,Your Rating\ntt01,9' })).toThrow(ParseError);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- tests/parsers/letterboxd.test.ts`
Expected: FAIL, "Failed to resolve import '@/parsers/letterboxd'".

- [ ] **Step 4: Write `src/parsers/letterboxd.ts`**

```ts
import Papa from 'papaparse';
import type { Film } from '@/domain/film';
import { normalizeRating } from '@/domain/rating';
import { ParseError, requireColumns, type ParseResult } from './types';

export interface LetterboxdFiles {
  diary?: string;
  ratings?: string;
  watched?: string;
}

const HINT =
  'In Letterboxd, go to Settings > Data > Export your data, then upload the .zip file without unpacking it.';

/** The slug at the end of a Letterboxd URI, used as a stable per-film identifier. */
function slugFromUri(uri: string | undefined): string | null {
  if (!uri) return null;
  const trimmed = uri.trim().replace(/\/$/, '');
  const slug = trimmed.split('/').pop();
  return slug && slug !== '' ? slug : null;
}

function parseNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | undefined): Date | null {
  if (!value || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseCsv(text: string, required: string[]): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  requireColumns(parsed.meta.fields ?? [], required, HINT);
  return parsed.data;
}

function blankFilm(slug: string, row: Record<string, string>): Film {
  return {
    id: `lb:${slug}`,
    imdbId: null,
    tmdbId: null,
    title: (row['Name'] ?? '').trim(),
    year: parseNumber(row['Year']),
    rating: null,
    ratingScale: 'letterboxd5',
    watchedAt: null,
    watchedAtIsApproximate: false,
    isRewatch: false,
    // Letterboxd exports carry no metadata; TMDB enrichment fills these in plan 2.
    genres: [],
    directors: [],
    runtimeMinutes: null,
    publicRating: null,
    posterPath: null,
    source: 'letterboxd',
  };
}

/**
 * Merge the diary, ratings, and watched files of a Letterboxd export.
 * The files overlap heavily, so each is folded into a map keyed by film slug,
 * in order of decreasing richness: diary, then ratings, then watched.
 */
export function parseLetterboxdExport(files: LetterboxdFiles): ParseResult {
  if (!files.diary && !files.ratings && !files.watched) {
    throw new ParseError(
      'No Letterboxd data file was found in this export.',
      HINT,
    );
  }

  const bySlug = new Map<string, Film>();
  const warnings: string[] = [];

  const upsert = (row: Record<string, string>): Film | null => {
    const slug = slugFromUri(row['Letterboxd URI']);
    const name = (row['Name'] ?? '').trim();
    if (!slug || !name) {
      warnings.push(`Skipped a row that could not be read: "${name || 'untitled'}".`);
      return null;
    }
    const existing = bySlug.get(slug);
    if (existing) return existing;
    const film = blankFilm(slug, row);
    bySlug.set(slug, film);
    return film;
  };

  // The diary is the only file with watch dates and rewatch flags.
  if (files.diary) {
    for (const row of parseCsv(files.diary, ['Name', 'Letterboxd URI', 'Watched Date'])) {
      const film = upsert(row);
      if (!film) continue;
      const rating = parseNumber(row['Rating']);
      if (rating !== null) film.rating = normalizeRating(rating, 'letterboxd5');
      film.watchedAt = parseDate(row['Watched Date']) ?? parseDate(row['Date']);
      film.isRewatch = (row['Rewatch'] ?? '').trim().toLowerCase() === 'yes';
    }
  }

  // Ratings adds films rated outside the diary; it must not overwrite a diary date.
  if (files.ratings) {
    for (const row of parseCsv(files.ratings, ['Name', 'Letterboxd URI', 'Rating'])) {
      const film = upsert(row);
      if (!film) continue;
      if (film.rating === null) {
        const rating = parseNumber(row['Rating']);
        if (rating !== null) film.rating = normalizeRating(rating, 'letterboxd5');
      }
      film.watchedAt ??= parseDate(row['Date']);
    }
  }

  // Watched contributes only films absent from both other files.
  if (files.watched) {
    for (const row of parseCsv(files.watched, ['Name', 'Letterboxd URI'])) {
      const film = upsert(row);
      if (!film) continue;
      film.watchedAt ??= parseDate(row['Date']);
    }
  }

  return { films: [...bySlug.values()], skipped: 0, warnings };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- tests/parsers/letterboxd.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/letterboxd.ts tests/parsers/letterboxd.test.ts tests/fixtures/letterboxd-*.csv
git commit -m "feat(parsers): merge Letterboxd diary, ratings, and watched exports"
```

---

### Task 7: Library deduplication

**Files:**
- Create: `src/domain/dedupe.ts`
- Test: `tests/domain/dedupe.test.ts`

**Interfaces:**
- Consumes: `Film` (Task 4), `matchKey` (Task 4).
- Produces: `mergeLibraries(...libraries: Film[][]): Film[]`

- [ ] **Step 1: Write the failing tests**

`tests/domain/dedupe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeLibraries } from '@/domain/dedupe';
import type { Film } from '@/domain/film';

function film(overrides: Partial<Film> & Pick<Film, 'title'>): Film {
  return {
    id: `test:${overrides.title}`,
    imdbId: null,
    tmdbId: null,
    year: 1999,
    rating: null,
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
    ...overrides,
  };
}

describe('mergeLibraries', () => {
  it('returns a single library unchanged', () => {
    const library = [film({ title: 'The Matrix' })];
    expect(mergeLibraries(library)).toHaveLength(1);
  });

  it('merges the same film imported from both services', () => {
    const imdb = [film({ title: 'The Matrix', imdbId: 'tt0133093', rating: 90 })];
    const letterboxd = [film({ title: 'The Matrix', source: 'letterboxd', imdbId: 'tt0133093' })];
    expect(mergeLibraries(imdb, letterboxd)).toHaveLength(1);
  });

  it('matches on title and year when no IMDb identifier is available', () => {
    const imdb = [film({ title: 'Amélie', year: 2001, imdbId: null })];
    const letterboxd = [film({ title: 'Amelie', year: 2001, source: 'letterboxd' })];
    expect(mergeLibraries(imdb, letterboxd)).toHaveLength(1);
  });

  it('keeps a remake separate from the original', () => {
    const merged = mergeLibraries(
      [film({ title: 'Dune', year: 1984 })],
      [film({ title: 'Dune', year: 2021, source: 'letterboxd' })],
    );
    expect(merged).toHaveLength(2);
  });

  it('prefers the record carrying a precise watch date', () => {
    const imdb = [
      film({ title: 'Parasite', imdbId: 'tt6751668', watchedAt: new Date('2024-01-01'), watchedAtIsApproximate: true }),
    ];
    const letterboxd = [
      film({ title: 'Parasite', imdbId: 'tt6751668', source: 'letterboxd', watchedAt: new Date('2023-09-01') }),
    ];
    const [merged] = mergeLibraries(imdb, letterboxd);
    expect(merged!.watchedAt).toEqual(new Date('2023-09-01'));
    expect(merged!.watchedAtIsApproximate).toBe(false);
  });

  it('fills gaps from whichever record has the metadata', () => {
    const imdb = [film({ title: 'Parasite', imdbId: 'tt6751668', genres: ['Drama'], runtimeMinutes: 132 })];
    const letterboxd = [film({ title: 'Parasite', imdbId: 'tt6751668', source: 'letterboxd', rating: 100 })];
    const [merged] = mergeLibraries(imdb, letterboxd);
    expect(merged!.genres).toEqual(['Drama']);
    expect(merged!.runtimeMinutes).toBe(132);
    expect(merged!.rating).toBe(100);
  });
});
```

The last two tests encode the real merge policy: Letterboxd wins on watch history because it actually records it, IMDb wins on metadata because Letterboxd exports none.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- tests/domain/dedupe.test.ts`
Expected: FAIL, "Failed to resolve import '@/domain/dedupe'".

- [ ] **Step 3: Write the implementation**

`src/domain/dedupe.ts`:

```ts
import type { Film } from './film';
import { matchKey } from './normalize';

/**
 * Combine one record of the same film from two services.
 * Watch history comes from whichever record has a precise date; metadata comes
 * from whichever record actually has it. Neither service is authoritative for both.
 */
function mergeFilm(base: Film, incoming: Film): Film {
  const incomingHasBetterDate =
    incoming.watchedAt !== null &&
    (base.watchedAt === null || (base.watchedAtIsApproximate && !incoming.watchedAtIsApproximate));

  return {
    ...base,
    imdbId: base.imdbId ?? incoming.imdbId,
    tmdbId: base.tmdbId ?? incoming.tmdbId,
    year: base.year ?? incoming.year,
    rating: base.rating ?? incoming.rating,
    ratingScale: base.rating !== null ? base.ratingScale : incoming.ratingScale,
    watchedAt: incomingHasBetterDate ? incoming.watchedAt : base.watchedAt,
    watchedAtIsApproximate: incomingHasBetterDate
      ? incoming.watchedAtIsApproximate
      : base.watchedAtIsApproximate,
    isRewatch: base.isRewatch || incoming.isRewatch,
    genres: base.genres.length > 0 ? base.genres : incoming.genres,
    directors: base.directors.length > 0 ? base.directors : incoming.directors,
    runtimeMinutes: base.runtimeMinutes ?? incoming.runtimeMinutes,
    publicRating: base.publicRating ?? incoming.publicRating,
    posterPath: base.posterPath ?? incoming.posterPath,
  };
}

/** Combine any number of imported libraries into one, without duplicate films. */
export function mergeLibraries(...libraries: Film[][]): Film[] {
  const byKey = new Map<string, Film>();

  for (const library of libraries) {
    for (const film of library) {
      const key = matchKey(film);
      const existing = byKey.get(key);
      byKey.set(key, existing ? mergeFilm(existing, film) : film);
    }
  }

  return [...byKey.values()];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- tests/domain/dedupe.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/dedupe.ts tests/domain/dedupe.test.ts
git commit -m "feat(domain): merge libraries imported from both services"
```

---

### Task 8: Filters

**Files:**
- Create: `src/domain/filters.ts`
- Test: `tests/domain/filters.test.ts`

**Interfaces:**
- Consumes: `Film` (Task 4).
- Produces:
  - `interface FilterCriteria` with every field optional
  - `applyFilters(films: Film[], criteria: FilterCriteria): Film[]`
  - `availableGenres(films: Film[]): string[]`, `availableDirectors(films: Film[]): string[]`

- [ ] **Step 1: Write the failing tests**

`tests/domain/filters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyFilters, availableGenres, availableDirectors } from '@/domain/filters';
import type { Film } from '@/domain/film';

function film(overrides: Partial<Film> & Pick<Film, 'title'>): Film {
  return {
    id: `test:${overrides.title}`,
    imdbId: null,
    tmdbId: null,
    year: 1999,
    rating: 70,
    ratingScale: 'imdb10',
    watchedAt: new Date('2024-06-15'),
    watchedAtIsApproximate: false,
    isRewatch: false,
    genres: [],
    directors: [],
    runtimeMinutes: 120,
    publicRating: 70,
    posterPath: null,
    source: 'imdb',
    ...overrides,
  };
}

const library: Film[] = [
  film({ title: 'Loved', rating: 100, genres: ['Drama'], directors: ['Bong Joon-ho'], watchedAt: new Date('2025-02-01'), publicRating: 80, runtimeMinutes: 132 }),
  film({ title: 'Liked', rating: 80, genres: ['Action'], directors: ['Christopher Nolan'], watchedAt: new Date('2024-05-01'), publicRating: 90, runtimeMinutes: 150 }),
  film({ title: 'Meh', rating: 50, genres: ['Comedy'], directors: ['Christopher Nolan'], watchedAt: new Date('2023-03-01'), publicRating: 60, runtimeMinutes: 95, isRewatch: true }),
  film({ title: 'Unrated', rating: null, genres: ['Horror'], directors: [], watchedAt: new Date('2025-01-01'), publicRating: null, runtimeMinutes: 88 }),
];

describe('applyFilters', () => {
  it('returns everything when no criteria are set', () => {
    expect(applyFilters(library, {})).toHaveLength(4);
  });

  it('filters by minimum rating and excludes unrated films', () => {
    const result = applyFilters(library, { minRating: 80 });
    expect(result.map((f) => f.title)).toEqual(['Loved', 'Liked']);
  });

  it('keeps only unrated films when asked', () => {
    expect(applyFilters(library, { onlyUnrated: true }).map((f) => f.title)).toEqual(['Unrated']);
  });

  it('filters by watch date range', () => {
    const result = applyFilters(library, { watchedAfter: new Date('2025-01-01') });
    expect(result.map((f) => f.title).sort()).toEqual(['Loved', 'Unrated']);
  });

  it('filters by genre, matching any selected genre', () => {
    const result = applyFilters(library, { genres: ['Drama', 'Horror'] });
    expect(result.map((f) => f.title).sort()).toEqual(['Loved', 'Unrated']);
  });

  it('filters by director', () => {
    const result = applyFilters(library, { directors: ['Christopher Nolan'] });
    expect(result.map((f) => f.title)).toEqual(['Liked', 'Meh']);
  });

  it('filters by decade of release', () => {
    const withOld = [...library, film({ title: 'Old', year: 1985 })];
    expect(applyFilters(withOld, { decades: [1980] }).map((f) => f.title)).toEqual(['Old']);
  });

  it('filters by runtime', () => {
    const result = applyFilters(library, { maxRuntimeMinutes: 100 });
    expect(result.map((f) => f.title).sort()).toEqual(['Meh', 'Unrated']);
  });

  it('filters by rewatch status', () => {
    expect(applyFilters(library, { onlyRewatches: true }).map((f) => f.title)).toEqual(['Meh']);
  });

  it('finds films the user rated far above the public', () => {
    // Loved: 100 vs 80 = +20. Meh: 50 vs 60 = -10.
    const result = applyFilters(library, { minRatingDelta: 15 });
    expect(result.map((f) => f.title)).toEqual(['Loved']);
  });

  it('finds films the user rated far below the public', () => {
    const result = applyFilters(library, { maxRatingDelta: -5 });
    expect(result.map((f) => f.title).sort()).toEqual(['Liked', 'Meh']);
  });

  it('limits to the top N by rating, highest first', () => {
    const result = applyFilters(library, { topN: 2 });
    expect(result.map((f) => f.title)).toEqual(['Loved', 'Liked']);
  });

  it('combines criteria conjunctively', () => {
    const result = applyFilters(library, { minRating: 50, directors: ['Christopher Nolan'], maxRuntimeMinutes: 100 });
    expect(result.map((f) => f.title)).toEqual(['Meh']);
  });
});

describe('availableGenres', () => {
  it('lists every genre present, sorted and deduplicated', () => {
    expect(availableGenres(library)).toEqual(['Action', 'Comedy', 'Drama', 'Horror']);
  });
});

describe('availableDirectors', () => {
  it('lists every director present, sorted and deduplicated', () => {
    expect(availableDirectors(library)).toEqual(['Bong Joon-ho', 'Christopher Nolan']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- tests/domain/filters.test.ts`
Expected: FAIL, "Failed to resolve import '@/domain/filters'".

- [ ] **Step 3: Write the implementation**

`src/domain/filters.ts`:

```ts
import type { Film } from './film';

export interface FilterCriteria {
  minRating?: number;
  maxRating?: number;
  onlyUnrated?: boolean;
  watchedAfter?: Date;
  watchedBefore?: Date;
  genres?: string[];
  directors?: string[];
  /** Decade start years, e.g. [1980, 1990]. */
  decades?: number[];
  minRuntimeMinutes?: number;
  maxRuntimeMinutes?: number;
  onlyRewatches?: boolean;
  /** Keep films whose rating exceeds the public rating by at least this much. */
  minRatingDelta?: number;
  /** Keep films whose rating falls below the public rating by at least this much. */
  maxRatingDelta?: number;
  /** Keep only the highest-rated N films, applied after every other criterion. */
  topN?: number;
}

function matches(film: Film, criteria: FilterCriteria): boolean {
  const {
    minRating, maxRating, onlyUnrated, watchedAfter, watchedBefore,
    genres, directors, decades, minRuntimeMinutes, maxRuntimeMinutes,
    onlyRewatches, minRatingDelta, maxRatingDelta,
  } = criteria;

  if (onlyUnrated) return film.rating === null;

  // An unrated film cannot satisfy a rating threshold, so exclude it rather than
  // treating a missing rating as zero.
  if (minRating !== undefined && (film.rating === null || film.rating < minRating)) return false;
  if (maxRating !== undefined && (film.rating === null || film.rating > maxRating)) return false;

  if (watchedAfter && (!film.watchedAt || film.watchedAt < watchedAfter)) return false;
  if (watchedBefore && (!film.watchedAt || film.watchedAt > watchedBefore)) return false;

  if (genres?.length && !film.genres.some((genre) => genres.includes(genre))) return false;
  if (directors?.length && !film.directors.some((director) => directors.includes(director))) return false;

  if (decades?.length) {
    if (film.year === null) return false;
    if (!decades.includes(Math.floor(film.year / 10) * 10)) return false;
  }

  if (minRuntimeMinutes !== undefined && (film.runtimeMinutes === null || film.runtimeMinutes < minRuntimeMinutes)) return false;
  if (maxRuntimeMinutes !== undefined && (film.runtimeMinutes === null || film.runtimeMinutes > maxRuntimeMinutes)) return false;

  if (onlyRewatches && !film.isRewatch) return false;

  if (minRatingDelta !== undefined || maxRatingDelta !== undefined) {
    if (film.rating === null || film.publicRating === null) return false;
    const delta = film.rating - film.publicRating;
    if (minRatingDelta !== undefined && delta < minRatingDelta) return false;
    if (maxRatingDelta !== undefined && delta > maxRatingDelta) return false;
  }

  return true;
}

/** Apply every set criterion. Criteria combine conjunctively; topN is applied last. */
export function applyFilters(films: Film[], criteria: FilterCriteria): Film[] {
  const filtered = films.filter((film) => matches(film, criteria));

  if (criteria.topN === undefined) return filtered;

  return [...filtered]
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    .slice(0, criteria.topN);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function availableGenres(films: Film[]): string[] {
  return uniqueSorted(films.flatMap((film) => film.genres));
}

export function availableDirectors(films: Film[]): string[] {
  return uniqueSorted(films.flatMap((film) => film.directors));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- tests/domain/filters.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/filters.ts tests/domain/filters.test.ts
git commit -m "feat(domain): add the full filter criteria set"
```

---

### Task 9: Tier definitions and auto-assignment

**Files:**
- Create: `src/domain/tiers.ts`
- Test: `tests/domain/tiers.test.ts`

**Interfaces:**
- Consumes: `Film` (Task 4).
- Produces:
  - `interface Tier { id: string; label: string; color: string; minRating: number | null }`
  - `DEFAULT_TIERS: Tier[]`
  - `interface TierBoard { tiers: Tier[]; placements: Record<string, string[]>; pool: string[] }`
  - `createEmptyBoard(films: Film[], tiers?: Tier[]): TierBoard`
  - `autoFillBoard(films: Film[], tiers?: Tier[]): TierBoard`
  - `moveFilm(board: TierBoard, filmId: string, toTierId: string | null, toIndex: number): TierBoard`

- [ ] **Step 1: Write the failing tests**

`tests/domain/tiers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_TIERS, createEmptyBoard, autoFillBoard, moveFilm } from '@/domain/tiers';
import type { Film } from '@/domain/film';

function film(id: string, rating: number | null): Film {
  return {
    id, imdbId: null, tmdbId: null, title: id, year: 2000,
    rating, ratingScale: 'imdb10', watchedAt: null, watchedAtIsApproximate: false,
    isRewatch: false, genres: [], directors: [], runtimeMinutes: null,
    publicRating: null, posterPath: null, source: 'imdb',
  };
}

const films = [film('a', 95), film('b', 85), film('c', 75), film('d', 65), film('e', 55), film('f', 30), film('g', null)];

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
});
```

The immutability test is not pedantry: React state updates depend on it, and a mutating `moveFilm` produces a board that silently fails to re-render.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- tests/domain/tiers.test.ts`
Expected: FAIL, "Failed to resolve import '@/domain/tiers'".

- [ ] **Step 3: Write the implementation**

`src/domain/tiers.ts`:

```ts
import type { Film } from './film';

export interface Tier {
  id: string;
  label: string;
  color: string;
  /** Lowest normalized rating that lands in this tier; null means "everything remaining". */
  minRating: number | null;
}

export const DEFAULT_TIERS: Tier[] = [
  { id: 'S', label: 'S', color: 'var(--color-tier-s)', minRating: 90 },
  { id: 'A', label: 'A', color: 'var(--color-tier-a)', minRating: 80 },
  { id: 'B', label: 'B', color: 'var(--color-tier-b)', minRating: 70 },
  { id: 'C', label: 'C', color: 'var(--color-tier-c)', minRating: 60 },
  { id: 'D', label: 'D', color: 'var(--color-tier-d)', minRating: 50 },
  { id: 'F', label: 'F', color: 'var(--color-tier-f)', minRating: null },
];

export interface TierBoard {
  tiers: Tier[];
  /** Tier id -> ordered film ids. */
  placements: Record<string, string[]>;
  /** Film ids not yet placed in any tier. */
  pool: string[];
}

function emptyPlacements(tiers: Tier[]): Record<string, string[]> {
  return Object.fromEntries(tiers.map((tier) => [tier.id, []]));
}

/** A board with every film in the pool, for users who prefer to rank from scratch. */
export function createEmptyBoard(films: Film[], tiers: Tier[] = DEFAULT_TIERS): TierBoard {
  return { tiers, placements: emptyPlacements(tiers), pool: films.map((film) => film.id) };
}

function tierForRating(rating: number, tiers: Tier[]): Tier | undefined {
  return tiers.find((tier) => tier.minRating === null || rating >= tier.minRating);
}

/** A board pre-filled from imported ratings. Unrated films stay in the pool. */
export function autoFillBoard(films: Film[], tiers: Tier[] = DEFAULT_TIERS): TierBoard {
  const placements = emptyPlacements(tiers);
  const pool: string[] = [];

  const sorted = [...films].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));

  for (const film of sorted) {
    if (film.rating === null) {
      pool.push(film.id);
      continue;
    }
    const tier = tierForRating(film.rating, tiers);
    if (tier) placements[tier.id]!.push(film.id);
    else pool.push(film.id);
  }

  return { tiers, placements, pool };
}

/**
 * Move a film to a position in a tier, or back to the pool when toTierId is null.
 * Returns a new board; the input is never mutated.
 */
export function moveFilm(
  board: TierBoard,
  filmId: string,
  toTierId: string | null,
  toIndex: number,
): TierBoard {
  const placements: Record<string, string[]> = Object.fromEntries(
    Object.entries(board.placements).map(([id, ids]) => [id, ids.filter((f) => f !== filmId)]),
  );
  const pool = board.pool.filter((id) => id !== filmId);

  if (toTierId === null) {
    pool.splice(Math.max(0, Math.min(toIndex, pool.length)), 0, filmId);
  } else {
    const target = placements[toTierId];
    if (!target) return board;
    target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, filmId);
  }

  return { tiers: board.tiers, placements, pool };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- tests/domain/tiers.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the whole suite and check coverage**

```bash
npm run test:coverage
```

Expected: all tests pass; `src/domain` and `src/parsers` above 90% statement coverage.

- [ ] **Step 6: Commit and push**

```bash
git add src/domain/tiers.ts tests/domain/tiers.test.ts
git commit -m "feat(domain): add tier definitions, auto-fill, and immutable moves"
git push
```

- [ ] **Step 7: Confirm CI is green**

```bash
gh run watch
```

Expected: the CI workflow passes on the pushed commit. The data core is complete and proven; plan 2 builds the import interface on top of it without changing a line of it.

---

## Definition of done

- [ ] The public repository `cinetier` exists, with CI and Pages deployment both green.
- [ ] `https://<owner>.github.io/cinetier/` loads.
- [ ] No secret has ever entered git history: searching `git log -p` for the key *value* finds nothing.
- [ ] `npm run test:run` passes, covering both parsers, rating conversion, deduplication, all filters, and tier assignment.
- [ ] `npm run typecheck` and `npm run lint` pass, including the layer-boundary rule.
- [ ] Both real export formats parse correctly from committed fixtures.
- [ ] README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, and SECURITY are all present and were
      committed *before* the repository was made public.
- [ ] A commit with a non-conventional message is rejected by the commitlint hook.
