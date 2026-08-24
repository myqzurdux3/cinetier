# Cinetier Visual Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Cinetier a real visual identity — two themes, a condensed display typeface, page textures, a front page, a denser library, and a logo that survives 16px and colour-inverting extensions.

**Architecture:** Everything visual is a CSS custom property. `:root` holds the default theme (salle obscure); `[data-theme='neon']` redefines the same names and nothing else. No component branches on the theme, so no component needs re-testing per theme. The chosen theme lives in `localStorage` and is applied to `<html>` by an inline script before first paint.

**Tech Stack:** React 19, TypeScript 6 (strict, `noUncheckedIndexedAccess`), Vite 8, Tailwind CSS v4, Vitest 4 (`core`/node and `ui`/jsdom projects), ESLint 10 flat config, `@fontsource-variable/*` for self-hosted fonts.

**Spec:** `docs/superpowers/specs/2026-08-19-cinetier-visual-identity-design.md`

## Global Constraints

- **Fonts are self-hosted.** No `fonts.googleapis.com`, no `fonts.gstatic.com`, no CDN of any kind. The README promises "the only outbound requests are to TMDB" and that claim must stay true.
- **No component names a theme.** There is no `theme === 'neon' ? … : …` anywhere in `src/ui/**`. A component that must differ between themes gets a token, not a branch.
- **No colour literal in `src/ui/**`.** Hex, `rgb(`, `hsl(` are rejected by lint. The two exceptions are `src/ui/logoMark.ts` (the favicon needs literal colours — a data URI cannot read a CSS variable) and `src/index.css` (where the tokens are defined).
- **`src/domain/**` and `src/parsers/**` must not use** `fetch`, `window`, `document`, `localStorage`, `sessionStorage`, `indexedDB`, `navigator`, `XMLHttpRequest`, `process`, or dynamic `import()`. Unchanged by this plan; do not weaken it.
- **Never stage or commit** `.env.local`, `.env`, or any file containing an API key.
- **A tier is never identified by colour alone.** Its letter is always rendered beside it.
- **Commit scopes** are limited to `domain, parsers, services, ui, deps, ci, docs` — commitlint rejects anything else.
- **Every task ends green:** `npm run typecheck`, `npm run lint`, `npm run test:run` all pass before the commit.

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `src/services/theme.ts` | Read, write and apply the theme. The only module that touches `localStorage` for this. |
| `src/ui/theme/useTheme.ts` | React hook wrapping the service; single source of theme state in the tree. |
| `src/ui/theme/ThemeToggle.tsx` | The control in the header. |
| `src/ui/PageTexture.tsx` | The one fixed overlay per page — grain or scanlines, chosen by token. |
| `src/ui/logoMark.ts` | The mark as data: shapes plus roles. Rendered by React and by the favicon generator. |
| `src/ui/Landing.tsx` | The front page: title, tier bar, service cards, privacy line. |
| `src/ui/library/LibraryHeader.tsx` | The library's header band, replacing the thin summary line's layout. |
| `vite-plugins/favicon.ts` | Generates the favicon from `logoMark.ts` at build time. |
| `tests/ui/theme.test.ts` | Theme persistence and fallback. |
| `tests/ui/tokens.test.ts` | Token parity between the two themes. |
| `tests/ui/contrast.test.ts` | WCAG AA on every ink-on-surface pair, in both themes. |
| `tests/ui/logoMark.test.ts` | One source of truth for component and favicon. |
| `tests/ui/PageTexture.test.tsx` | Overlay presence and reduced-transparency behaviour. |
| `tests/ui/Landing.test.tsx` | Front page content and the service handoff. |
| `tests/ui/ThemeToggle.test.tsx` | Switching, labelling, keyboard reachability. |

**Modified**

| File | Change |
| --- | --- |
| `src/index.css` | Both palettes, font tokens, texture tokens. |
| `index.html` | Inline no-flash script; the favicon `<link>` becomes a placeholder the plugin fills. |
| `vite.config.ts` | Register the favicon plugin. |
| `eslint.config.js` | Reject colour literals in `src/ui/**`. |
| `src/ui/Logo.tsx` | Render from `logoMark.ts`. |
| `src/ui/Shell.tsx` | Texture overlay, theme toggle, display face on the wordmark. |
| `src/ui/App.tsx` | Use `Landing` for the source-picking screen; pass the import generation to the grid. |
| `src/ui/import/SourcePicker.tsx` | Restyled cards; used by `Landing`. |
| `src/ui/library/FilmGrid.tsx` | Responsive columns, staggered entrance. |
| `src/ui/library/FilmCard.tsx` | Rating chip on the accent, display face for the figure. |
| `src/ui/library/LibrarySummary.tsx` | Becomes the header band's content. |

---

### Task 1: The two palettes as tokens

**Files:**
- Modify: `src/index.css`
- Test: `tests/ui/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the token names every later task uses — `--color-screen`, `--color-surface`, `--color-surface-raised`, `--color-ink`, `--color-ink-dim`, `--color-line`, `--color-accent`, `--color-on-accent`, `--color-danger`, `--color-tier-s|a|b|c|d|f`, `--shadow-glow`, `--texture-image`, `--texture-opacity`, `--vignette`, `--radius-card`. The neon theme is selected by `data-theme="neon"` on any ancestor; in practice `<html>`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');

/** The declarations inside one top-level block, by its opening selector. */
function block(opening: string): string {
  const start = css.indexOf(opening);
  if (start === -1) throw new Error(`No block opening with ${opening}`);
  const from = css.indexOf('{', start);
  let depth = 0;
  for (let i = from; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(from + 1, i);
    }
  }
  throw new Error(`Unterminated block ${opening}`);
}

function names(declarations: string): string[] {
  return [...declarations.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!);
}

// Tokens whose value is deliberately shared by both themes: shape, not colour.
const SHARED = /^--(radius|font|spacing)-/;

describe('theme tokens', () => {
  const base = names(block('@theme'));
  const neon = names(block("[data-theme='neon']"));

  it('defines a neon value for every themed token', () => {
    // A token missing from one theme silently inherits the other theme's value,
    // which reads as "the neon theme is mostly fine" instead of as a defect.
    const themed = base.filter((name) => !SHARED.test(name));
    expect(themed.length).toBeGreaterThan(10);
    expect(themed.filter((name) => !neon.includes(name))).toEqual([]);
  });

  it('introduces no token in neon that the default theme lacks', () => {
    expect(neon.filter((name) => !base.includes(name))).toEqual([]);
  });

  it('gives every tier a colour in both themes', () => {
    for (const tier of ['s', 'a', 'b', 'c', 'd', 'f']) {
      expect(base).toContain(`--color-tier-${tier}`);
      expect(neon).toContain(`--color-tier-${tier}`);
    }
  });

  it('gives the two themes different grounds, so the switch is visible', () => {
    const value = (declarations: string, name: string) =>
      declarations.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();
    expect(value(block('@theme'), '--color-screen')).not.toBe(
      value(block("[data-theme='neon']"), '--color-screen'),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/tokens.test.ts`
Expected: FAIL — `No block opening with [data-theme='neon']`.

- [ ] **Step 3: Write the tokens**

Replace the whole of `src/index.css`:

```css
@import 'tailwindcss';

/*
  Salle obscure is the default theme, so its values live on :root rather than
  behind a selector — a page with no data-theme attribute is already correct.
  Vidéoclub néon redefines the same names below and nothing else: no component
  knows a theme exists, so none of them needs testing twice.
*/
@theme {
  --color-screen: #0a0908;
  --color-surface: #17140f;
  --color-surface-raised: #211c15;
  --color-ink: #f4efe6;
  --color-ink-dim: #a39a8b;
  --color-line: #2c261d;
  --color-accent: #e8b44a;
  --color-on-accent: #0a0908;
  --color-danger: #e86a5c;

  --color-tier-s: #e24b4b;
  --color-tier-a: #e8823c;
  --color-tier-b: #e8b44a;
  --color-tier-c: #9cbf4a;
  --color-tier-d: #4fa3d1;
  --color-tier-f: #6f6a60;

  /* The accent's halo. Salle obscure is lit, not glowing. */
  --shadow-glow: none;

  /*
    The page-wide overlay. One fixed layer, never one per card: a grain applied
    to every poster tile is the version of this that ruins scrolling.
  */
  --texture-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
  --texture-opacity: 0.035;
  --vignette: radial-gradient(120% 60% at 50% 0%, rgb(232 180 74 / 0.09), transparent 70%);

  --font-display: 'Oswald Variable', 'Arial Narrow', sans-serif;
  --font-text:
    'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;

  --radius-card: 6px;
}

[data-theme='neon'] {
  --color-screen: #08040f;
  --color-surface: #150c22;
  --color-surface-raised: #1f1030;
  --color-ink: #f6f1ff;
  --color-ink-dim: #a99cc4;
  --color-line: #2e1d45;
  --color-accent: #ff2e88;
  --color-on-accent: #08040f;
  --color-danger: #ff5c5c;

  --color-tier-s: #ff2e88;
  --color-tier-a: #ff6b3d;
  --color-tier-b: #ffd23f;
  --color-tier-c: #3dff9e;
  --color-tier-d: #22e5ff;
  --color-tier-f: #7a6e96;

  --shadow-glow: 0 0 18px rgb(255 46 136 / 0.45);

  /* Scanlines rather than grain: the video shop, not the projection booth. */
  --texture-image: repeating-linear-gradient(
    to bottom,
    rgb(255 255 255 / 0.5) 0px,
    rgb(255 255 255 / 0.5) 1px,
    transparent 1px,
    transparent 3px
  );
  --texture-opacity: 0.05;
  --vignette: radial-gradient(120% 60% at 50% 0%, rgb(34 229 255 / 0.1), transparent 70%);
}

body {
  font-family: var(--font-text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/tokens.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Prove the parity test can fail**

Delete the `--color-tier-c` line from the `[data-theme='neon']` block, run the test, confirm it fails naming that token, then put the line back and confirm green again. A test that cannot fail is worse than no test — this plan asks for the check because the last two plans each shipped one that could not.

- [ ] **Step 6: Verify nothing else broke**

Run: `npm run typecheck && npm run lint && npm run test:run`
Expected: all pass. Existing components still compile — every token they used (`screen`, `surface`, `ink`, `ink-dim`, `line`, `accent`, `tier-*`, `radius-card`) still exists.

- [ ] **Step 7: Commit**

```bash
git add src/index.css tests/ui/tokens.test.ts
git commit -m "feat(ui): define both themes as one set of tokens"
```

---

### Task 2: Theme persistence, the switch, and no flash on load

**Files:**
- Create: `src/services/theme.ts`, `src/ui/theme/useTheme.ts`, `src/ui/theme/ThemeToggle.tsx`
- Create: `tests/ui/theme.test.ts`, `tests/ui/ThemeToggle.test.tsx`
- Modify: `index.html`, `src/ui/Shell.tsx`, `eslint.config.js`

**Interfaces:**
- Consumes: the tokens and the `data-theme="neon"` selector from Task 1.
- Produces:
  - `src/services/theme.ts`: `export type ThemeName = 'cinema' | 'neon'`, `export const THEMES: readonly ThemeName[]`, `export const DEFAULT_THEME: ThemeName`, `export function loadTheme(): ThemeName`, `export function saveTheme(theme: ThemeName): void`, `export function applyTheme(theme: ThemeName): void`
  - `src/ui/theme/useTheme.ts`: `export function useTheme(): { theme: ThemeName; setTheme: (theme: ThemeName) => void }`
  - `src/ui/theme/ThemeToggle.tsx`: `export function ThemeToggle(): JSX.Element`

- [ ] **Step 1: Write the failing service test**

Create `tests/ui/theme.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadTheme, saveTheme, applyTheme, DEFAULT_THEME } from '@/services/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme persistence', () => {
  it('falls back to the default theme when nothing was ever chosen', () => {
    expect(loadTheme()).toBe(DEFAULT_THEME);
  });

  it('round-trips a chosen theme', () => {
    saveTheme('neon');
    expect(loadTheme()).toBe('neon');
  });

  it('ignores a stored value that is not a theme', () => {
    // A hand-edited or stale key must not put the app in an unstyled state.
    localStorage.setItem('cinetier:theme', 'midnight-hacker');
    expect(loadTheme()).toBe(DEFAULT_THEME);
  });

  it('falls back instead of throwing when storage is unavailable', () => {
    // Private browsing and blocked-storage settings make these throw, and a
    // throw here happens before the first paint — the whole page would be lost.
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    });
    expect(loadTheme()).toBe(DEFAULT_THEME);
    expect(() => saveTheme('neon')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('marks the document so the neon tokens take effect', () => {
    applyTheme('neon');
    expect(document.documentElement.dataset.theme).toBe('neon');
  });

  it('removes the marker for the default theme rather than naming it', () => {
    // The default theme lives on :root with no selector, so the attribute must
    // come off — leaving data-theme="cinema" would work only by accident.
    applyTheme('neon');
    applyTheme('cinema');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/theme.test.ts`
Expected: FAIL — cannot resolve `@/services/theme`.

- [ ] **Step 3: Write the service**

Create `src/services/theme.ts`:

```ts
export type ThemeName = 'cinema' | 'neon';

export const THEMES: readonly ThemeName[] = ['cinema', 'neon'];
export const DEFAULT_THEME: ThemeName = 'cinema';

const KEY = 'cinetier:theme';

function isTheme(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * The chosen theme, or the default.
 *
 * localStorage rather than IndexedDB because this has to be readable
 * synchronously before React mounts; an asynchronous read would show the
 * default theme for a frame on every visit.
 */
export function loadTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Private mode and blocked-storage settings throw here. A theme is a
    // preference; losing it costs nothing, and throwing would cost the page.
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // As above: the choice simply will not survive the session.
  }
}

/** The default theme's values live on :root, so it is the absence of a marker. */
export function applyTheme(theme: ThemeName): void {
  if (theme === DEFAULT_THEME) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
}
```

- [ ] **Step 4: Run the service test**

Run: `npx vitest run tests/ui/theme.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing toggle test**

Create `tests/ui/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '@/ui/theme/ThemeToggle';
import { loadTheme } from '@/services/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('names the theme it will switch to, not the one already active', async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /néon/i });
    await userEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('neon');
  });

  it('remembers the choice', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button'));
    expect(loadTheme()).toBe('neon');
  });

  it('switches back', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('is reachable and operable from the keyboard', async () => {
    render(<ThemeToggle />);
    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(document.documentElement.dataset.theme).toBe('neon');
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run tests/ui/ThemeToggle.test.tsx`
Expected: FAIL — cannot resolve `@/ui/theme/ThemeToggle`.

- [ ] **Step 7: Write the hook and the control**

Create `src/ui/theme/useTheme.ts`:

```ts
import { useCallback, useState } from 'react';
import { loadTheme, saveTheme, applyTheme, type ThemeName } from '@/services/theme';

/**
 * The theme as React state. The document attribute is the source of truth for
 * styling; this only keeps the control's label in step with it.
 */
export function useTheme(): { theme: ThemeName; setTheme: (theme: ThemeName) => void } {
  const [theme, setThemeState] = useState<ThemeName>(() => loadTheme());

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    saveTheme(next);
    applyTheme(next);
  }, []);

  return { theme, setTheme };
}
```

Create `src/ui/theme/ThemeToggle.tsx`:

```tsx
import { useTheme } from './useTheme';
import type { ThemeName } from '@/services/theme';

const NEXT: Record<ThemeName, { theme: ThemeName; label: string }> = {
  cinema: { theme: 'neon', label: 'Néon' },
  neon: { theme: 'cinema', label: 'Salle obscure' },
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = NEXT[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next.theme)}
      // The label names the destination, not the current state: a control
      // labelled with what you already have tells you nothing about the click.
      aria-label={`Switch to the ${next.label} theme`}
      className="rounded-full border border-line px-3 py-1 text-xs tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-ink"
    >
      {next.label}
    </button>
  );
}
```

- [ ] **Step 8: Run the toggle test**

Run: `npx vitest run tests/ui/ThemeToggle.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 9: Put the control in the header**

In `src/ui/Shell.tsx`, import `ThemeToggle` and place it in the header, before the tagline:

```tsx
<header className="flex items-center gap-3 px-6 py-4 border-b border-line">
  <Logo />
  <span className="font-display text-lg tracking-wide uppercase">Cinetier</span>
  <span className="ml-auto hidden text-sm text-ink-dim sm:block">
    Rank what you have already seen
  </span>
  <ThemeToggle />
</header>
```

- [ ] **Step 10: Stop the theme flashing on load**

In `index.html`, immediately after the opening `<body>` tag — before `<div id="root">` — add:

```html
<script>
  // Applied before the first paint. React mounts too late: a visitor on the
  // neon theme would see the default one for a frame on every single visit.
  // Inlined rather than imported for the same reason — a module request is a
  // round trip. Kept in step with src/services/theme.ts by tests/ui/theme.test.ts.
  try {
    var t = localStorage.getItem('cinetier:theme');
    if (t === 'neon') document.documentElement.dataset.theme = t;
  } catch (e) {
    /* storage blocked; the default theme is already correct */
  }
</script>
```

- [ ] **Step 11: Forbid colour literals in the interface**

In `eslint.config.js`, add a block after the `src/ui/**` React-hooks block:

```js
{
  files: ['src/ui/**/*.{ts,tsx}'],
  ignores: ['src/ui/logoMark.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        // Every colour belongs to a theme, and a literal belongs to neither.
        // logoMark.ts is exempt: a favicon data URI cannot read a CSS variable,
        // so the mark's literal values live there and nowhere else.
        selector:
          "Literal[value=/#[0-9a-fA-F]{3,8}\\b|\\brgba?\\(|\\bhsla?\\(/]",
        message:
          'Colours come from theme tokens, never literals — add a token in src/index.css.',
      },
    ],
  },
},
```

- [ ] **Step 12: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm run test:run`
Expected: all pass. If lint now flags an existing component, replace the literal with a token rather than adding an exemption.

- [ ] **Step 13: Commit**

```bash
git add src/services/theme.ts src/ui/theme index.html src/ui/Shell.tsx eslint.config.js tests/ui/theme.test.ts tests/ui/ThemeToggle.test.tsx
git commit -m "feat(ui): let the reader choose between the two themes"
```

---

### Task 3: Self-hosted typography

**Files:**
- Modify: `package.json` (dependencies), `src/main.tsx`, `src/index.css`, `src/ui/Shell.tsx`
- Test: `tests/ui/fonts.test.ts`

**Interfaces:**
- Consumes: `--font-display` and `--font-text` from Task 1.
- Produces: the Tailwind utilities `font-display` and `font-text`, usable by every later task.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/fonts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

describe('typography', () => {
  it('loads both faces from the bundle, never from a CDN', () => {
    // The README promises the only outbound requests are to TMDB. A webfont
    // pulled from a CDN would leak every visitor's address on first paint and
    // make that promise false.
    for (const source of [html, main, css]) {
      expect(source).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    }
    expect(main).toMatch(/@fontsource-variable\/oswald/);
    expect(main).toMatch(/@fontsource-variable\/inter/);
  });

  it('exposes both faces as tokens rather than naming them in components', () => {
    expect(css).toMatch(/--font-display:/);
    expect(css).toMatch(/--font-text:/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/fonts.test.ts`
Expected: FAIL — `main.tsx` imports no font.

- [ ] **Step 3: Install the two faces**

```bash
npm install @fontsource-variable/oswald @fontsource-variable/inter
```

- [ ] **Step 4: Import them where the app starts**

At the top of `src/main.tsx`, above the existing imports:

```tsx
// Bundled, not fetched: see the privacy claim in README.md. The variable
// builds carry every weight the interface uses in one file each.
import '@fontsource-variable/oswald';
import '@fontsource-variable/inter';
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/ui/fonts.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Apply the display face where it belongs**

The display face is for the wordmark, headings, tier letters and rating figures — never for film titles, which are long and suffer in a condensed face.

In `src/ui/Shell.tsx` the wordmark already carries `font-display` from Task 2. In `src/ui/library/FilmCard.tsx`, change the rating chip to:

```tsx
<figcaption className="absolute right-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 font-display text-xs tracking-wide text-on-accent">
  {formatRating(film.rating, film.ratingScale)}
</figcaption>
```

- [ ] **Step 7: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all pass; the build reports the two font files as assets.

```bash
git add package.json package-lock.json src/main.tsx src/ui/library/FilmCard.tsx tests/ui/fonts.test.ts
git commit -m "feat(ui): bundle the two typefaces instead of fetching them"
```

---

### Task 4: The page texture

**Files:**
- Create: `src/ui/PageTexture.tsx`, `tests/ui/PageTexture.test.tsx`
- Modify: `src/ui/Shell.tsx`

**Interfaces:**
- Consumes: `--texture-image`, `--texture-opacity`, `--vignette` from Task 1.
- Produces: `export function PageTexture(): JSX.Element` — rendered once by `Shell`, never by a card.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/PageTexture.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageTexture } from '@/ui/PageTexture';

describe('PageTexture', () => {
  it('is decorative, so assistive technology never announces it', () => {
    const { container } = render(<PageTexture />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('never intercepts a click meant for the page beneath it', () => {
    const { container } = render(<PageTexture />);
    // A full-viewport fixed overlay that takes pointer events makes the whole
    // interface unclickable, and it does so silently.
    expect(container.firstElementChild).toHaveClass('pointer-events-none');
  });

  it('is one element for the whole page, not one per anything', () => {
    const { container } = render(<PageTexture />);
    expect(container.querySelectorAll('div[aria-hidden="true"]').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/PageTexture.test.tsx`
Expected: FAIL — cannot resolve `@/ui/PageTexture`.

- [ ] **Step 3: Write the overlay**

Create `src/ui/PageTexture.tsx`:

```tsx
/**
 * The page's texture: film grain in salle obscure, scanlines in néon.
 *
 * One fixed element for the entire page. The tempting alternative — a texture
 * on each poster tile — multiplies the cost by the size of the library and is
 * the version of this that makes scrolling stutter.
 *
 * Which texture appears is entirely a matter of tokens; this component has no
 * idea which theme is active, and must not gain one.
 */
export function PageTexture() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 motion-reduce:hidden"
      style={{
        backgroundImage: 'var(--texture-image), var(--vignette)',
        opacity: 'var(--texture-opacity)',
        mixBlendMode: 'overlay',
      }}
    />
  );
}
```

Add to `src/index.css`, after the theme blocks:

```css
/*
  Readers who ask for reduced transparency are asking not to have content sat
  under a wash. Hiding the layer is the honest response; dimming it is not.
*/
@media (prefers-reduced-transparency: reduce) {
  [data-texture] {
    display: none;
  }
}
```

and give the overlay `data-texture` in the component:

```tsx
    <div
      data-texture
      aria-hidden="true"
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ui/PageTexture.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Render it once, in the shell**

In `src/ui/Shell.tsx`, put `<PageTexture />` as the first child of the outermost `div`, and add `relative` to that div's classes so the overlay's `fixed` positioning has an explicit stacking context alongside `z-0`. Wrap the existing header/main/footer in nothing new; give them `relative z-10` so they sit above the wash:

```tsx
<div className="relative min-h-screen bg-screen text-ink flex flex-col">
  <PageTexture />
  <header className="relative z-10 flex items-center gap-3 px-6 py-4 border-b border-line">
```

Apply `relative z-10` to `<main>` and `<footer>` as well.

- [ ] **Step 6: Measure the cost before believing it is free**

Run `npm run dev`, import the IMDb fixture at `tests/fixtures/imdb-ratings.csv`, then duplicate it in memory by importing it several times if needed to reach a few hundred cards. Open the browser's performance panel, record a scroll of the library, and note the frame rate with the overlay present.

If it is below 55fps, replace `mixBlendMode: 'overlay'` with plain `opacity` — blend modes on a full-viewport fixed layer are the usual culprit — and measure again. Record the number you measured in the commit message. Do not skip this step: "it looks fine" is not a measurement, and a texture that costs frames on a modest machine is worse than no texture.

- [ ] **Step 7: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run test:run`

```bash
git add src/ui/PageTexture.tsx src/ui/Shell.tsx src/index.css tests/ui/PageTexture.test.tsx
git commit -m "feat(ui): give each theme its own page texture"
```

---

### Task 5: The mark, redrawn, with a generated favicon

**Files:**
- Create: `src/ui/logoMark.ts`, `vite-plugins/favicon.ts`, `tests/ui/logoMark.test.ts`
- Modify: `src/ui/Logo.tsx`, `index.html`, `vite.config.ts`

**Interfaces:**
- Consumes: the tier tokens from Task 1.
- Produces:
  - `src/ui/logoMark.ts`: `export type LogoRole`, `export interface LogoShape`, `export const LOGO_VIEW_BOX: string`, `export const LOGO_SHAPES: readonly LogoShape[]`, `export const FAVICON_COLOURS: Record<LogoRole, string>`, `export function logoSvgMarkup(colour: (role: LogoRole) => string, size: number): string`
  - `vite-plugins/favicon.ts`: `export function faviconPlugin(): Plugin`

**Why the mark changes:** the current clapperboard carries its meaning in two greys and three 2px stripes. It fails at 16px, and on 2026-08-19 the Dark Reader extension repainted every fill and reduced it to a white blob on the user's own browser. The replacement is three chunky slanted bars of decreasing width in three well-separated hues — a tier list and a strip of film at once, with no detail thinner than a quarter of the mark's height and no meaning carried by a grey.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/logoMark.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  LOGO_SHAPES,
  LOGO_VIEW_BOX,
  FAVICON_COLOURS,
  logoSvgMarkup,
  type LogoRole,
} from '@/ui/logoMark';

describe('the logo mark', () => {
  it('has no detail thinner than a quarter of its height', () => {
    // The mark has to survive a 16px favicon. Anything finer disappears there,
    // and disappears first on a low-resolution screen.
    const height = Number(LOGO_VIEW_BOX.split(' ')[3]);
    expect(height).toBe(32);

    for (const shape of LOGO_SHAPES) {
      const ys = [...shape.d.matchAll(/-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)].map((m) =>
        Number(m[1]),
      );
      expect(ys.length).toBeGreaterThanOrEqual(4);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(height / 4);
    }
  });

  it('carries no meaning in a grey', () => {
    // A grey mark is what an inverting extension turns into a single blob.
    const greys = Object.values(FAVICON_COLOURS).filter((hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) < 24;
    });
    expect(greys).toEqual([]);
  });

  it('gives every shape a colour', () => {
    for (const shape of LOGO_SHAPES) {
      expect(FAVICON_COLOURS[shape.fill]).toBeDefined();
    }
  });

  it('renders the same shapes for the component and for the favicon', () => {
    // One source of truth. The favicon used to be hand-copied into index.html,
    // and it had already drifted from the component it was meant to mirror.
    const asVariables = logoSvgMarkup((role: LogoRole) => `var(--color-${role})`, 32);
    const asLiterals = logoSvgMarkup((role: LogoRole) => FAVICON_COLOURS[role], 32);

    const shapeCount = (markup: string) => (markup.match(/<(path|rect)\b/g) ?? []).length;
    expect(shapeCount(asVariables)).toBe(LOGO_SHAPES.length);
    expect(shapeCount(asLiterals)).toBe(LOGO_SHAPES.length);
    expect(asVariables).toContain('var(--color-tier-s)');
    expect(asLiterals).not.toContain('var(');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/logoMark.test.ts`
Expected: FAIL — cannot resolve `@/ui/logoMark`.

- [ ] **Step 3: Write the mark as data**

Create `src/ui/logoMark.ts`:

```ts
/**
 * The Cinetier mark, held as data so that exactly one description of it exists.
 *
 * Three slanted bars of decreasing width: a tier list and a strip of film at
 * once. The shape carries the meaning, not the shading — the previous mark put
 * its meaning in two greys and 2px stripes, and it failed at favicon size and
 * vanished entirely under an extension that repaints fills.
 *
 * Colour is passed in rather than baked in: the component resolves each role to
 * a CSS variable so the mark follows the theme, while the favicon generator
 * resolves it to a literal, because a data URI cannot read a variable.
 */
export type LogoRole = 'tier-s' | 'tier-b' | 'tier-d';

export interface LogoShape {
  readonly d: string;
  readonly fill: LogoRole;
}

export const LOGO_VIEW_BOX = '0 0 32 32';

export const LOGO_SHAPES: readonly LogoShape[] = [
  { d: 'M2 5 L30 3 L30 11 L2 13 Z', fill: 'tier-s' },
  { d: 'M2 14.5 L23 13 L23 21 L2 22.5 Z', fill: 'tier-b' },
  { d: 'M2 24 L16 23 L16 31 L2 32 Z', fill: 'tier-d' },
];

/**
 * The literal colours the favicon uses — the default theme's tier values.
 * This file is the one place in src/ui allowed a colour literal, and the lint
 * configuration exempts it by name for exactly this reason.
 */
export const FAVICON_COLOURS: Record<LogoRole, string> = {
  'tier-s': '#e24b4b',
  'tier-b': '#e8b44a',
  'tier-d': '#4fa3d1',
};

export function logoSvgMarkup(colour: (role: LogoRole) => string, size: number): string {
  const paths = LOGO_SHAPES.map(
    (shape) => `<path d='${shape.d}' fill='${colour(shape.fill)}'/>`,
  ).join('');

  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${LOGO_VIEW_BOX}' width='${size}' height='${size}'>${paths}</svg>`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ui/logoMark.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Render the component from the same data**

Replace `src/ui/Logo.tsx`:

```tsx
import { LOGO_SHAPES, LOGO_VIEW_BOX } from './logoMark';

interface LogoProps {
  size?: number;
}

/** The mark, following the active theme through its tier tokens. */
export function Logo({ size = 28 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox={LOGO_VIEW_BOX} role="img" aria-label="Cinetier">
      {LOGO_SHAPES.map((shape) => (
        <path key={shape.d} d={shape.d} fill={`var(--color-${shape.fill})`} />
      ))}
    </svg>
  );
}
```

- [ ] **Step 6: Generate the favicon at build time**

Create `vite-plugins/favicon.ts`:

```ts
import type { Plugin } from 'vite';
import { FAVICON_COLOURS, logoSvgMarkup, type LogoRole } from '../src/ui/logoMark';

/**
 * Writes the favicon into index.html from the same description the component
 * renders. It used to be pasted in by hand, and the copy had already drifted
 * from the component without anyone noticing.
 */
export function faviconPlugin(): Plugin {
  return {
    name: 'cinetier-favicon',
    transformIndexHtml(html) {
      const markup = logoSvgMarkup((role: LogoRole) => FAVICON_COLOURS[role], 32);
      const href = `data:image/svg+xml,${encodeURIComponent(markup)}`;
      return html.replace('%FAVICON%', href);
    },
  };
}
```

In `index.html`, replace the whole hand-written favicon `<link>` and its comment with:

```html
<!-- Generated from src/ui/logoMark.ts by vite-plugins/favicon.ts. Do not edit. -->
<link rel="icon" href="%FAVICON%" />
```

In `vite.config.ts`, import and register it:

```ts
import { faviconPlugin } from './vite-plugins/favicon';
// …
  plugins: [react(), tailwindcss(), faviconPlugin()],
```

- [ ] **Step 7: Prove the favicon really is generated**

Run: `npm run build && grep -c '%FAVICON%' dist/index.html`
Expected: `0` — the placeholder is gone.

Run: `grep -o "data:image/svg+xml[^\"]*" dist/index.html | head -c 200`
Expected: an encoded SVG containing three `path` elements.

- [ ] **Step 8: Look at it**

Run `npm run dev`, open the app, and check the browser tab. Then screenshot the header logo at its natural size and again after temporarily setting `size={160}`. Both must show three clearly separated coloured bars. Restore the size when done.

- [ ] **Step 9: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run test:run`

```bash
git add src/ui/logoMark.ts src/ui/Logo.tsx vite-plugins index.html vite.config.ts tests/ui/logoMark.test.ts
git commit -m "feat(ui): redraw the mark and generate the favicon from it"
```

---

### Task 6: A front page

**Files:**
- Create: `src/ui/Landing.tsx`, `tests/ui/Landing.test.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/import/SourcePicker.tsx`

**Interfaces:**
- Consumes: `SourcePicker`'s existing `onPick: (source: ImportSource) => void`, and the tokens from Task 1.
- Produces: `export function Landing({ onPick }: { onPick: (source: ImportSource) => void }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `tests/ui/Landing.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Landing } from '@/ui/Landing';

describe('Landing', () => {
  it("says what the product makes, in the reader's terms", () => {
    render(<Landing onPick={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/cinetier/i);
    expect(screen.getByText(/already (watched|seen)/i)).toBeInTheDocument();
  });

  it('shows the six tiers as the product signature, each with its letter', () => {
    render(<Landing onPick={vi.fn()} />);
    // Colour alone never identifies a tier: a reader who cannot separate the
    // hues still has to be able to read the board this product exists to make.
    for (const letter of ['S', 'A', 'B', 'C', 'D', 'F']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }
  });

  it('promotes the privacy promise out of the fine print', () => {
    render(<Landing onPick={vi.fn()} />);
    expect(screen.getByText(/never leave your browser/i)).toBeInTheDocument();
  });

  it('hands the chosen service back', async () => {
    const onPick = vi.fn();
    render(<Landing onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: /imdb/i }));
    expect(onPick).toHaveBeenCalledWith('imdb');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/Landing.test.tsx`
Expected: FAIL — cannot resolve `@/ui/Landing`.

- [ ] **Step 3: Write the front page**

Create `src/ui/Landing.tsx`:

```tsx
import { SourcePicker, type ImportSource } from './import/SourcePicker';

interface LandingProps {
  onPick: (source: ImportSource) => void;
}

const TIERS = [
  { letter: 'S', token: 'tier-s' },
  { letter: 'A', token: 'tier-a' },
  { letter: 'B', token: 'tier-b' },
  { letter: 'C', token: 'tier-c' },
  { letter: 'D', token: 'tier-d' },
  { letter: 'F', token: 'tier-f' },
];

export function Landing({ onPick }: LandingProps) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <div className="space-y-4">
        <h1 className="font-display text-6xl uppercase leading-none tracking-wide sm:text-8xl">
          Cinetier
        </h1>
        <p className="max-w-xl text-lg text-ink-dim">
          Rank everything you have already watched. Drop in your IMDb or Letterboxd
          export and it becomes a tier list.
        </p>
      </div>

      {/* The product's signature, and the plainest possible statement of what it
          makes. The letter rides on every band: colour alone never names a tier. */}
      <div className="flex overflow-hidden rounded-card" aria-hidden="false">
        {TIERS.map((tier) => (
          <div
            key={tier.letter}
            className="flex-1 py-2 text-center font-display text-sm tracking-widest text-on-accent"
            style={{ backgroundColor: `var(--color-${tier.token})` }}
          >
            {tier.letter}
          </div>
        ))}
      </div>

      <SourcePicker onPick={onPick} />

      <p className="text-sm text-ink-dim">
        Your ratings never leave your browser. There is no account and no server.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Restyle the service cards**

In `src/ui/import/SourcePicker.tsx`, change the button's classes to give the cards real presence and use the display face for the service name:

```tsx
className="rounded-card border border-line bg-surface p-6 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-surface-raised focus-visible:border-accent focus-visible:outline-none motion-reduce:hover:translate-y-0"
```

and the name:

```tsx
<span className="block font-display text-2xl uppercase tracking-wide">{source.name}</span>
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/ui/Landing.test.tsx tests/ui/SourcePicker.test.tsx`
Expected: PASS. If the existing `SourcePicker` test asserted an old class name, update the assertion to test behaviour rather than styling.

- [ ] **Step 6: Use it in the app**

In `src/ui/App.tsx`, the branch that currently renders `SourcePicker` inside a narrow wrapper becomes `Landing`:

```tsx
  return (
    <Shell>
      {source === null ? (
        <Landing onPick={setSource} />
      ) : (
        <div className="mx-auto max-w-2xl px-6 py-16">
          <ImportGuide source={source} onBack={() => setSource(null)} onImported={onImported} />
        </div>
      )}
    </Shell>
  );
```

Adjust to the file's actual structure; the point is that the landing screen is no longer confined to a 2xl column.

- [ ] **Step 7: Look at it in both themes**

Run `npm run dev`, screenshot the front page, click the theme control, screenshot it again. Both must be legible and neither may show a grey-on-grey heading.

- [ ] **Step 8: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run test:run`

```bash
git add src/ui/Landing.tsx src/ui/App.tsx src/ui/import/SourcePicker.tsx tests/ui/Landing.test.tsx
git commit -m "feat(ui): give the app a front page instead of a question in the dark"
```

---

### Task 7: A denser library that fills its screen

**Files:**
- Create: `src/ui/library/LibraryHeader.tsx`, `tests/ui/LibraryHeader.test.tsx`
- Modify: `src/ui/library/FilmGrid.tsx`, `src/ui/library/FilmCard.tsx`, `src/ui/App.tsx`
- Test: `tests/ui/FilmGrid.test.tsx`

**Interfaces:**
- Consumes: `LibrarySummary`'s existing props (`films`, `warnings`, `skipped`, `enriching`, `onReset`).
- Produces:
  - `src/ui/library/LibraryHeader.tsx`: `export function LibraryHeader(props: LibrarySummaryProps): JSX.Element` — a band wrapping `LibrarySummary`.
  - `FilmGrid` gains an optional `generation?: number` prop: it changes once per import, and is what tells the grid to play its entrance again.

- [ ] **Step 1: Write the failing grid test**

Add to `tests/ui/FilmGrid.test.tsx`:

```tsx
  it('plays the entrance once per import, not on every render', () => {
    // The grid is virtualized: rows scrolled into view later must not animate,
    // or a long library flickers for as long as the reader keeps scrolling.
    const films = Array.from({ length: 12 }, (_, i) => film(`f${i}`));
    const { container, rerender } = render(<FilmGrid films={films} generation={1} />);
    expect(container.querySelectorAll('[data-entering="true"]').length).toBeGreaterThan(0);

    rerender(<FilmGrid films={films} generation={1} />);
    expect(container.querySelectorAll('[data-entering="true"]').length).toBe(0);

    rerender(<FilmGrid films={films} generation={2} />);
    expect(container.querySelectorAll('[data-entering="true"]').length).toBeGreaterThan(0);
  });
```

Use the file's existing `film()` helper; if it takes different arguments, follow it.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/FilmGrid.test.tsx`
Expected: FAIL — `generation` is not a prop and no element carries `data-entering`.

- [ ] **Step 3: Make the grid denser and give it an entrance**

Replace `src/ui/library/FilmGrid.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Film } from '@/domain/film';
import { FilmCard } from './FilmCard';

interface FilmGridProps {
  films: Film[];
  columns?: number;
  /** Changes once per import. Playing the entrance again is what it means. */
  generation?: number;
}

const ROW_HEIGHT = 214;

export function FilmGrid({ films, columns = 8, generation = 0 }: FilmGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(films.length / columns);
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    setEntering(true);
    // One frame is enough to let the initial state paint; anything longer and
    // the reader sees the cards sitting in their pre-animation position.
    const id = requestAnimationFrame(() => setEntering(false));
    return () => cancelAnimationFrame(id);
  }, [generation]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  return (
    <div ref={scrollRef} className="h-[78vh] overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className="absolute left-0 grid w-full gap-2"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              transform: `translateY(${row.start}px)`,
            }}
          >
            {films.slice(row.index * columns, row.index * columns + columns).map((film, index) => (
              <div
                key={film.id}
                data-entering={entering ? 'true' : 'false'}
                className="motion-safe:transition-all motion-safe:duration-500 data-[entering=true]:translate-y-2 data-[entering=true]:opacity-0"
                style={{ transitionDelay: `${Math.min(index * 25, 200)}ms` }}
              >
                <FilmCard film={film} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the grid test**

Run: `npx vitest run tests/ui/FilmGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing header test**

Create `tests/ui/LibraryHeader.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LibraryHeader } from '@/ui/library/LibraryHeader';
import type { Film } from '@/domain/film';

function film(id: string): Film {
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
    source: 'imdb',
  };
}

describe('LibraryHeader', () => {
  it('presents the library as a titled section rather than a stray sentence', () => {
    render(
      <LibraryHeader
        films={[film('a')]}
        warnings={[]}
        skipped={0}
        enriching={null}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: /your library/i })).toBeInTheDocument();
    expect(screen.getByText(/1 film/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run tests/ui/LibraryHeader.test.tsx`
Expected: FAIL — cannot resolve `@/ui/library/LibraryHeader`.

- [ ] **Step 7: Write the header band**

Create `src/ui/library/LibraryHeader.tsx`:

```tsx
import { LibrarySummary } from './LibrarySummary';
import type { ComponentProps } from 'react';

type LibraryHeaderProps = ComponentProps<typeof LibrarySummary>;

/**
 * The library's header band. LibrarySummary still owns every count and every
 * warning; this only gives them somewhere to sit that reads as a section of a
 * page rather than a sentence stranded above a grid.
 */
export function LibraryHeader(props: LibraryHeaderProps) {
  return (
    <header className="space-y-3 rounded-card bg-surface px-5 py-4">
      <h2 className="font-display text-sm uppercase tracking-widest text-ink-dim">Your library</h2>
      <LibrarySummary {...props} />
    </header>
  );
}
```

In `src/ui/library/LibrarySummary.tsx`, drop the now-duplicated `border-b border-line pb-4` from its outer `div` — the band provides the separation.

- [ ] **Step 8: Use both in the app**

In `src/ui/App.tsx`: import `LibraryHeader`, replace the `LibrarySummary` element with it, and pass a generation to the grid. The generation is the same counter the enrichment guard already keeps:

```tsx
<div className="mx-auto max-w-7xl space-y-4 px-6 py-8">
  <LibraryHeader
    films={films}
    warnings={warnings}
    skipped={skipped}
    enriching={enriching}
    onReset={reset}
  />
  <FilmGrid films={films} generation={generation} />
</div>
```

Add `const [generation, setGeneration] = useState(0);` alongside the other state, and `setGeneration((n) => n + 1);` inside `onImported` next to `setFilms(outcome.films)`. Do not reuse `runId` — it is a ref, so changing it would not re-render.

- [ ] **Step 9: Look at it in both themes**

Run `npm run dev`, import the fixture, screenshot the library in both themes. The grid must fill the screen rather than hugging the top eighth of it.

- [ ] **Step 10: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run test:run`

```bash
git add src/ui/library src/ui/App.tsx tests/ui/FilmGrid.test.tsx tests/ui/LibraryHeader.test.tsx
git commit -m "feat(ui): let the library fill the screen it was given"
```

---

### Task 8: Prove the palettes are readable, and show the result

**Files:**
- Create: `tests/ui/contrast.test.ts`
- Modify: `README.md`, `docs/superpowers/backlog.md`

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces: nothing later tasks use. This is the closing verification.

- [ ] **Step 1: Write the contrast test**

Create `tests/ui/contrast.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');

function tokens(opening: string): Record<string, string> {
  const start = css.indexOf(opening);
  const from = css.indexOf('{', start);
  let depth = 0;
  let end = from;
  for (let i = from; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(from + 1, end);
  return Object.fromEntries(
    [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]),
  );
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function ratio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const THEMES = {
  'salle obscure': { ...tokens('@theme') },
  neon: { ...tokens('@theme'), ...tokens("[data-theme='neon']") },
};

describe.each(Object.entries(THEMES))('contrast in %s', (_name, t) => {
  it('reaches AA for body text on every surface', () => {
    for (const surface of ['--color-screen', '--color-surface', '--color-surface-raised']) {
      expect(ratio(t['--color-ink']!, t[surface]!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reaches AA for dimmed text on the two surfaces it is used on', () => {
    for (const surface of ['--color-screen', '--color-surface']) {
      expect(ratio(t['--color-ink-dim']!, t[surface]!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reaches AA for text sitting on the accent', () => {
    expect(ratio(t['--color-on-accent']!, t['--color-accent']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every tier band readable under its letter', () => {
    // The letter is what identifies a tier when the colours cannot be told
    // apart, so it has to be legible on all six.
    for (const tier of ['s', 'a', 'b', 'c', 'd', 'f']) {
      expect(ratio(t['--color-on-accent']!, t[`--color-tier-${tier}`]!)).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/ui/contrast.test.ts`
Expected: PASS. **If a pair fails, adjust the token in `src/index.css` until it passes — do not relax the threshold.** Record any value you changed in the commit message; the spec's tables are a starting point, not a result.

- [ ] **Step 3: Run everything, including coverage**

Run: `npm run typecheck && npm run lint && npm run test:coverage && npm run build`
Expected: all pass, coverage still above the configured thresholds (90/85/90/90).

- [ ] **Step 4: Show both themes**

Run `npm run dev` and capture, in each theme:

1. the front page,
2. the library populated from `tests/fixtures/imdb-ratings.csv`,
3. the header logo at its natural size.

Six screenshots. Look at each one. A theme that has been implemented but never looked at is the failure mode this plan is guarding against, and it is why the list is explicit.

- [ ] **Step 5: Update the documents**

In `README.md`, add to the feature list:

```markdown
- **Two looks.** Salle obscure by default, or a neon video-shop palette —
  remembered between visits, and neither one asks the network for a font.
```

In `docs/superpowers/backlog.md`, strike the entry that reads "the interface has no visual identity", and record anything this plan chose to defer.

- [ ] **Step 6: Commit**

```bash
git add tests/ui/contrast.test.ts README.md docs/superpowers/backlog.md
git commit -m "test(ui): hold both palettes to AA, and record the identity as shipped"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| 1. Token architecture | 1 (tokens), 2 (persistence, no-flash, lint rule) |
| 2. The palettes | 1, verified in 8 |
| 3. Typography | 3 |
| 4. Textures | 4 |
| 5. Landing screen | 6 |
| 6. Library grid | 7 |
| 7. The logo | 5 |
| 8. Verification | 4 (scroll cost), 5 (favicon parity), 8 (contrast, screenshots) |
| Privacy constraint on fonts | 3, asserted by `tests/ui/fonts.test.ts` |

Every spec section maps to a task. The three rules under "Token architecture" are each enforced by something that fails: rule 1 by review, rule 2 by lint (Task 2 step 11), rule 3 by `tests/ui/tokens.test.ts`.

**Type consistency**

`ThemeName` is `'cinema' | 'neon'` in Task 2 and used unchanged in Tasks 2 and 8. `LogoRole` is `'tier-s' | 'tier-b' | 'tier-d'` in Task 5, and `logoSvgMarkup(colour, size)` keeps that signature in both call sites. `FilmGrid`'s new `generation` prop is optional in Task 7 and passed from `App.tsx` in the same task. `LibraryHeader` takes exactly `LibrarySummary`'s props, derived with `ComponentProps` so the two cannot drift.

**Known deferrals**

- The `columns={8}` default is fixed rather than responsive. A breakpoint-aware column count needs a measured container, which is a change to how the virtualizer is sized; it is worth doing once the tier board settles the page's layout, and it is recorded in the backlog by Task 8.
- Neon's glow token is defined and available but only the toggle and the service cards consume it. The tier board is where it will earn its place.
