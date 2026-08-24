import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Comments are stripped before anything looks for a selector. These helpers
// find a block by `indexOf` on its opening text, and the prose in that file
// discusses the very selectors they search for — a sentence mentioning
// [data-theme='neon'] sent the parser into a comment and quietly emptied the
// neon theme, which read as "neon defines nothing" instead of as a bad parse.
const css = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

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
  // The default theme is two blocks, not one: @theme holds everything Tailwind
  // should build utilities from, and a plain `:root` rule holds the tier
  // palette, which Tailwind would otherwise tree-shake away because every
  // reference to it is composed at runtime. Both are the default theme, so
  // both are read here — see the comment above that rule in src/index.css.
  const base = [...names(block('@theme')), ...names(block(':root'))];
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
