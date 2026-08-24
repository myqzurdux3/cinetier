import { describe, it, expect } from 'vitest';
import { normalizeRating, denormalizeRating, formatRating } from '@/domain/rating';

describe('normalizeRating', () => {
  it('maps the IMDb scale onto 0-100', () => {
    expect(normalizeRating(10, 'imdb10')).toBe(100);
    expect(normalizeRating(8, 'imdb10')).toBe(80);
    expect(normalizeRating(1, 'imdb10')).toBe(10);
  });

  it('maps the Letterboxd scale onto 0-100', () => {
    expect(normalizeRating(5, 'letterboxd5')).toBe(100);
    expect(normalizeRating(3.5, 'letterboxd5')).toBe(70);
    expect(normalizeRating(0.5, 'letterboxd5')).toBe(10);
  });

  it('rejects values outside the scale rather than silently clamping', () => {
    expect(() => normalizeRating(11, 'imdb10')).toThrow(/out of range/i);
    expect(() => normalizeRating(0, 'letterboxd5')).toThrow(/out of range/i);
  });
});

describe('denormalizeRating', () => {
  it('round-trips every valid IMDb rating', () => {
    for (let r = 1; r <= 10; r += 1) {
      expect(denormalizeRating(normalizeRating(r, 'imdb10'), 'imdb10')).toBe(r);
    }
  });

  it('round-trips every valid Letterboxd rating', () => {
    for (let r = 0.5; r <= 5; r += 0.5) {
      expect(denormalizeRating(normalizeRating(r, 'letterboxd5'), 'letterboxd5')).toBe(r);
    }
  });

  it('snaps a cross-scale value to the nearest step of the target scale', () => {
    // 75/100 is not expressible in half-stars; 3.5 and 4 are the neighbours.
    expect(denormalizeRating(75, 'letterboxd5')).toBe(4);
    expect(denormalizeRating(74, 'letterboxd5')).toBe(3.5);
  });
});

describe('formatRating', () => {
  it('renders the IMDb scale as a mark out of ten', () => {
    expect(formatRating(80, 'imdb10')).toBe('8/10');
  });

  it('renders the Letterboxd scale as stars, including a half star', () => {
    expect(formatRating(70, 'letterboxd5')).toBe('★★★½');
    expect(formatRating(100, 'letterboxd5')).toBe('★★★★★');
  });
});
