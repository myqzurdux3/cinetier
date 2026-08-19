import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync('index.html', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

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
    for (const source of [html, main, css]) {
      expect(source).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    }

    // Verify bundled fonts are imported
    expect(main).toMatch(/@fontsource-variable\/oswald/);
    expect(main).toMatch(/@fontsource-variable\/inter/);
  });

  it('exposes both faces as tokens rather than naming them in components', () => {
    expect(css).toMatch(/--font-display:/);
    expect(css).toMatch(/--font-text:/);
  });
});
