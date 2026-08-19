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
