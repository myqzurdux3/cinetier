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
