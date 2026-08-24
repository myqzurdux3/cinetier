# Cinetier visual identity — design

**Date:** 2026-08-19
**Status:** approved, awaiting implementation plan
**Supersedes nothing.** Extends `2026-08-18-cinetier-design.md`, which stays the
authority on data, parsing and privacy.

## Why this exists

Two plans shipped a working import and library. Neither gave the product a look.
The interface today is one grey on one black: a single accent colour that no
screen uses, six tier colours that appear nowhere but the logo, and a library
screen whose content occupies the top eighth of the viewport. The user's verdict
was that it "manque réellement d'originalité et de couleur", and they were right —
there is no identity to warm up, because there is none.

This spec defines that identity, and it comes before the filter rail and the tier
board deliberately: those screens are mostly colour and density, so building them
on the current grey base would mean building them twice.

## Scope

**In:** design tokens and theming, two themes, typography, page textures, the
landing screen, the library grid's density and entrance, and a redrawn logo whose
favicon is generated rather than copied.

**Out:** the filter rail, the tier board, drag-and-drop, and PNG export. Those are
the next plan. This one only has to leave them a base worth building on — which
means the tier colours must be finished here, because the board is made of them.

## Decisions taken

| Question | Decision |
| --- | --- |
| Direction | Two themes: **Salle obscure** (default) and **Vidéoclub néon** |
| How far they diverge | Palette and textures. Shared typography, grid and density |
| Typography | Condensed display face for titles, tier letters and figures; neutral sans for text |
| Fonts | **Self-hosted.** Not Google Fonts — see Privacy below |
| Scope of the pass | Skin the existing screens, plus a real landing page |
| Theming mechanism | CSS custom properties only; components never know a theme exists |

Néon is opt-in rather than default because it is tiring over a long session, and
because a look that strong is better chosen than imposed.

## Privacy constraint on fonts

The README promises that "the only outbound requests are to TMDB". Loading a
typeface from `fonts.googleapis.com` would make that false, and would leak every
visitor's IP address to a third party on first paint. Fonts are therefore
installed as npm packages and bundled. This is not a preference; it is the
existing privacy claim, and the claim is load-bearing for a product whose whole
pitch is that your ratings never leave your browser.

## 1. Token architecture

`src/index.css` keeps declaring semantic names in `@theme`, never literal ones.
The default values on `:root` **are** Salle obscure. `[data-theme='neon']`
redefines the same names and nothing else.

```
:root { --color-screen: …; --color-accent: …; … }        /* salle obscure */
[data-theme='neon'] { --color-screen: …; --color-accent: …; … }
```

Three rules make this hold:

1. **No component names a theme.** There is no `theme === 'neon' ? … : …` in any
   `.tsx`. A component that needs to look different in one theme needs a token,
   not a branch.
2. **No component writes a literal colour.** An ESLint rule rejects hex literals
   and `rgb(`/`hsl(` in `src/ui/**`, the way layer boundaries are already
   enforced. Tier colours already live in tokens; this keeps it that way.
3. **Every token exists in every theme.** A unit test reads both blocks and fails
   on any name defined in one and missing from the other — a missing token
   inherits the other theme's value silently, which is the failure mode that
   looks like "the neon theme is mostly fine".

### The token set

Structural, in both themes:

`--color-screen`, `--color-surface`, `--color-surface-raised`, `--color-ink`,
`--color-ink-dim`, `--color-line`, `--color-accent`, `--color-on-accent`,
`--color-danger`, `--color-tier-s|a|b|c|d|f`, `--radius-card`.

New, carrying the per-theme character:

- `--shadow-glow` — the accent's halo. A real shadow in néon, `none` in salle
  obscure. Applied by shared components unconditionally; the theme decides
  whether it shows.
- `--texture-image` / `--texture-opacity` — the page overlay's source and
  strength. Grain in salle obscure, scanlines in néon.
- `--vignette` — the top-of-page wash. Warm amber in salle obscure, transparent
  in néon.

### Persistence and first paint

The chosen theme goes in `localStorage` (not IndexedDB: it must be readable
synchronously before React mounts). A small inline script in `index.html` reads
it and sets `data-theme` on `<html>` before the first paint. Without it every
visit flashes the default theme before switching, which reads as a bug.

The script must be inline and tiny, and must not throw when `localStorage` is
unavailable (private mode, blocked storage) — it falls back to the default theme.

## 2. The palettes

**Salle obscure** — a warm near-black, lit like a screen in a dark room.

| Token | Value |
| --- | --- |
| screen | `#0A0908` |
| surface | `#17140F` |
| surface-raised | `#211C15` |
| ink | `#F4EFE6` |
| ink-dim | `#A39A8B` |
| line | `#2C261D` |
| accent | `#E8B44A` |
| on-accent | `#0A0908` |
| danger | `#E86A5C` |
| tier S → F | `#E24B4B` `#E8823C` `#E8B44A` `#9CBF4A` `#4FA3D1` `#6F6A60` |

**Vidéoclub néon** — a violet-black, saturated, magenta and cyan.

| Token | Value |
| --- | --- |
| screen | `#08040F` |
| surface | `#150C22` |
| surface-raised | `#1F1030` |
| ink | `#F6F1FF` |
| ink-dim | `#A99CC4` |
| line | `#2E1D45` |
| accent | `#FF2E88` |
| on-accent | `#08040F` |
| danger | `#FF5C5C` |
| tier S → F | `#FF2E88` `#FF6B3D` `#FFD23F` `#3DFF9E` `#22E5FF` `#7A6E96` |

Every ink-on-surface pair must reach WCAG AA (4.5:1) for body text and 3:1 for
large text; the values above are chosen to, and the check is part of the plan's
verification rather than an assumption. Tier colours are decoration carrying
meaning, so a tier is never identified by colour alone — its letter is always
present.

## 3. Typography

- **Display** — a condensed grotesque, used for the landing title, section
  headings, tier letters and rating figures. Uppercase with widened tracking for
  tier letters only.
- **Text** — a neutral variable sans for everything else.

Concretely: **Oswald** (variable, 200–700) for display and **Inter** (variable)
for text, both from `@fontsource-variable/*`. Named here so the plan does not have
to invent them; a substitution is allowed only if it keeps the condensed/neutral
contrast and ships self-hosted.

Both self-hosted through npm, latin subset, `font-display: swap`, preloaded for
the two faces the first screen actually paints. Exposed as `--font-display` and
`--font-text` so the two themes cannot drift apart typographically.

Film titles keep the text face: a condensed face at card size hurts legibility on
the long titles that matter most.

## 4. Textures

One fixed overlay element per page, never per card — a grain applied to every
poster tile is the version of this that ruins scrolling.

- **Salle obscure:** SVG `fractalNoise` grain at 2–4% opacity, plus a soft amber
  vignette falling from the top edge.
- **Vidéoclub néon:** a fine repeating scanline gradient at low opacity, plus the
  accent glow on interactive elements.

Both sit behind content with `pointer-events: none`. Under
`prefers-reduced-transparency` the overlay is removed; under
`prefers-reduced-motion` the entrance animations of §6 are removed, not merely
shortened.

## 5. Landing screen

The first screen becomes a real front page rather than a question floating in
grey:

- The product name in very large display type, with the six tier colours as a
  graphic bar — the mark of the product, and the clearest possible statement of
  what it makes.
- One line saying what it does, in the user's terms: rank what you have already
  watched.
- The two service cards, given real presence: hover raises them, the accent
  outlines the focused one.
- The privacy line promoted out of the footer — it is a selling point, not fine
  print.
- The theme switch in the header, reachable by keyboard, labelled, and remembered.

## 6. Library grid

- Denser: more columns at every breakpoint, tighter gutters, poster tiles carrying
  the rating chip on the accent rather than a grey box.
- The summary line becomes a library header — count, breakdown by type, and the
  import-again action given their own band instead of one thin sentence.
- Posters fade and rise in as they arrive, staggered by a few tens of
  milliseconds, once per import rather than on every re-render.
- Virtualization stays. The entrance animation must not run for rows scrolled into
  view later, or long libraries flicker forever.

## 7. The logo

Constraints, all of which the current mark fails at least one of:

1. Legible as a 16px favicon.
2. Legible at 28px in the header.
3. Survives an extension that repaints fills — Dark Reader flattened the current
   mark to a white blob on the user's own browser.
4. Works on both palettes without recolouring.

So: a bold silhouette, high-contrast blocks, no meaning carried by a subtle grey,
and no detail thinner than about 1/10 of the mark's height.

**One source.** The mark lives in exactly one module. The favicon is generated
from it at build time by a Vite `transformIndexHtml` hook, rather than being
hand-copied into `index.html` as it is now — the copy has already drifted from
the component it was supposed to mirror.

## 8. Verification

Automated:

- Every token defined in one theme is defined in the other.
- The theme survives a reload, and an unreadable `localStorage` falls back to the
  default instead of throwing.
- No hex literal in `src/ui/**` (lint).
- Contrast ratios for ink-on-surface and on-accent pairs meet AA.
- The generated favicon and the component render the same mark.

By hand, and shown rather than described:

- Both themes screenshotted on the landing screen and on a populated library.
- The logo screenshotted at 16px and 28px, and once at 160px — the size that
  exposed the Dark Reader repaint when the 28px view merely looked washed out.
- Scroll performance on a library of a few hundred posters with the texture
  overlay on.

## Risks

- **Font weight.** Two self-hosted variable faces add to the bundle. Subset to
  latin, preload only what the first screen paints, and measure the result rather
  than assume it.
- **Texture cost.** A full-page grain can cost real frames while scrolling. It is
  one fixed layer for this reason, and the plan measures it.
- **Two themes, one attention span.** The failure mode is a polished default and a
  neglected second theme. Every screenshot in the verification list is taken in
  both.
