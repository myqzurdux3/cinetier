import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync('index.html', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');
const fonts = readFileSync('src/fonts.css', 'utf8');

// Walk all source files to catch font references anywhere they might hide
function getSourceFiles() {
  const files: string[] = ['index.html'];
  const srcFiles = readdirSync('src', { recursive: true });
  for (const file of srcFiles) {
    if (/\.(ts|tsx|css)$/.test(String(file))) {
      files.push(join('src', String(file)));
    }
  }
  return files;
}

describe('typography', () => {
  it('loads both faces from the bundle, never from a CDN', () => {
    // The README promises the only outbound requests are to TMDB. A webfont
    // pulled from a CDN would leak every visitor's address on first paint and
    // make that promise false. This test walks all source files to catch
    // external font references.
    // Note: it cannot catch a hostname assembled at run time from string fragments.

    const sourceFiles = getSourceFiles();

    for (const filepath of sourceFiles) {
      const source = readFileSync(filepath, 'utf8');

      // Reject @import url(http...) stylesheet imports
      expect(source, `${filepath} should not @import from http`).not.toMatch(
        /@import\s+url\s*\(\s*https?:\/\//,
      );

      // Reject <link href="http..."> in HTML
      expect(source, `${filepath} should not have <link href="http...">`).not.toMatch(
        /<link[^>]*href\s*=\s*["']https?:\/\//,
      );

      // Reject .woff, .woff2, .ttf URLs beginning with http
      expect(source, `${filepath} should not reference http font files`).not.toMatch(
        /https?:\/\/[^\s"']*\.(woff|woff2|ttf)(?:["'\s]|$)/,
      );
    }

    // Specific regression test: Google Fonts CDN must not appear
    for (const source of [html, main, css, fonts]) {
      expect(source).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    }

    // Verify the bundled fonts are wired in: main.tsx pulls in the stylesheet
    // that declares the @font-face rules, and that stylesheet points at the
    // same two npm packages.
    expect(main).toMatch(/\.\/fonts\.css/);
    expect(fonts).toMatch(/@fontsource-variable\/oswald/);
    expect(fonts).toMatch(/@fontsource-variable\/inter/);
  });

  it('exposes both faces as tokens rather than naming them in components', () => {
    expect(css).toMatch(/--font-display:/);
    expect(css).toMatch(/--font-text:/);
  });

  it('ships only the latin subset, not the packages full entry points', () => {
    // @fontsource-variable/{inter,oswald}'s own index.css pulls in every
    // subset the upstream font carries (cyrillic, cyrillic-ext, greek,
    // greek-ext, vietnamese, latin-ext, latin — 12 woff2 files across the two
    // faces), regardless of what the interface's copy actually needs. This
    // interface is entirely Latin-1, so importing the full entry point would
    // regress back to shipping 12 files for 2 faces actually used.
    expect(main).not.toMatch(/@fontsource-variable\/(inter|oswald)['"]/);
    expect(fonts).toMatch(/inter-latin-wght-normal\.woff2/);
    expect(fonts).toMatch(/oswald-latin-wght-normal\.woff2/);
    expect(fonts).not.toMatch(/-latin-ext-/);
    expect(fonts).not.toMatch(/-cyrillic-/);
    expect(fonts).not.toMatch(/-greek-/);
    expect(fonts).not.toMatch(/-vietnamese-/);
  });

  it('preloads the two latin faces the first screen paints', () => {
    // A preload for a webfont still self-hosted, still no CDN — see the
    // "loads both faces from the bundle" test above for that guarantee.
    // This only checks that the browser is told to fetch them early.
    const preloads = [...html.matchAll(/<link\s+rel="preload"[^>]*>/g)].map((m) => m[0]);
    const fontPreloads = preloads.filter((tag) => tag.includes('as="font"'));
    expect(fontPreloads).toHaveLength(2);
    for (const tag of fontPreloads) {
      expect(tag).toMatch(/type="font\/woff2"/);
      expect(tag).toMatch(/crossorigin/);
    }
  });
});
