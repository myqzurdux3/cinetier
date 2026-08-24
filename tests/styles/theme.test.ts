import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { compile } from 'tailwindcss';

const require_ = createRequire(import.meta.url);
const INDEX_CSS = fileURLToPath(new URL('../../src/index.css', import.meta.url));

/**
 * Compile src/index.css the way the build does, with **no** scanned source
 * files — so the only variables that survive are the ones emitted
 * unconditionally.
 *
 * That empty candidate list is the whole point. Every reference to the tier
 * palette is assembled at runtime (`var(--color-tier-${color})`), so the
 * scanner can never see one; a palette that needs a scanned mention to survive
 * is a palette that will vanish the moment an unrelated file is edited. It
 * already had: five of the six were missing from the shipped stylesheet, and
 * the sixth was held up by a doc comment.
 */
async function compileStylesheet(): Promise<string> {
  const compiled = await compile(readFileSync(INDEX_CSS, 'utf8'), {
    base: fileURLToPath(new URL('../../src', import.meta.url)),
    loadStylesheet: (id: string) => {
      const path = require_.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id);
      return Promise.resolve({
        path,
        base: path.replace(/\/[^/]+$/, ''),
        content: readFileSync(path, 'utf8'),
      });
    },
  });
  return compiled.build([]);
}

const TIER_TOKENS = ['s', 'a', 'b', 'c', 'd', 'f'] as const;

describe('the tier palette reaches the browser', () => {
  it.each(TIER_TOKENS)('defines --color-tier-%s in the default theme', async (token) => {
    const css = await compileStylesheet();
    // Everything before the neon block is the default theme. Splitting here
    // matters: the neon block is a plain rule and always survived, so
    // searching the whole stylesheet would pass even with the default theme
    // empty — which is exactly the bug this pins.
    const defaultTheme = css.split("[data-theme='neon']")[0] ?? css;
    expect(defaultTheme).toContain(`--color-tier-${token}:`);
  });

  it.each(TIER_TOKENS)('defines --color-tier-%s in the neon theme', async (token) => {
    const css = await compileStylesheet();
    const neon = css.slice(css.indexOf("[data-theme='neon']"));
    expect(neon).toContain(`--color-tier-${token}:`);
  });
});
