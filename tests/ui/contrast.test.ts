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

type Combo = [pair: string, foreground: string, background: string];
type Failure = { pair: string; ratio: number };

/**
 * Evaluates every combo against the threshold and returns all the ones that
 * fall short, rather than throwing on the first — so a single failing
 * assertion names every bad pair in one run, not just the first it hits.
 */
function failing(threshold: number, combos: Combo[]): Failure[] {
  const failures: Failure[] = [];
  for (const [pair, foreground, background] of combos) {
    const r = ratio(foreground, background);
    if (r < threshold) failures.push({ pair, ratio: r });
  }
  return failures;
}

describe.each(Object.entries(THEMES))('contrast in %s', (_name, t) => {
  it('reaches AA for body text on every surface', () => {
    const combos: Combo[] = ['--color-screen', '--color-surface', '--color-surface-raised'].map(
      (surface) => [`ink on ${surface}`, t['--color-ink']!, t[surface]!],
    );
    expect(failing(4.5, combos)).toEqual([]);
  });

  it('reaches AA for dimmed text on the surfaces it is used on', () => {
    // Used directly on the screen and card surfaces, and inside
    // SourcePicker's buttons, whose resting background is the surface and
    // whose hover background is surface-raised — so all three are real
    // render paths, not just the two most obvious ones.
    const combos: Combo[] = ['--color-screen', '--color-surface', '--color-surface-raised'].map(
      (surface) => [`ink-dim on ${surface}`, t['--color-ink-dim']!, t[surface]!],
    );
    expect(failing(4.5, combos)).toEqual([]);
  });

  it('reaches AA for text sitting on the accent', () => {
    const combos: Combo[] = [
      ['on-accent on accent', t['--color-on-accent']!, t['--color-accent']!],
    ];
    expect(failing(4.5, combos)).toEqual([]);
  });

  it('keeps every tier band readable under its letter', () => {
    // The letter is what identifies a tier when the colours cannot be told
    // apart, so it has to be legible on all six. 3:1 rather than 4.5:1 is the
    // correct threshold here, not a relaxed one: Landing.tsx renders these
    // letters at text-xl font-bold (20px/700), which clears WCAG's large-text
    // definition (>=18.66px bold), so the large-text ratio is the one that
    // actually applies to this render path.
    const combos: Combo[] = ['s', 'a', 'b', 'c', 'd', 'f'].map((tier) => [
      `on-accent on tier-${tier}`,
      t['--color-on-accent']!,
      t[`--color-tier-${tier}`]!,
    ]);
    expect(failing(3, combos)).toEqual([]);
  });
});
