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
