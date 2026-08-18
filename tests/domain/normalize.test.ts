import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '@/domain/normalize';

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle('Spider-Man: No Way Home')).toBe('spider man no way home');
  });

  it('strips diacritics so accented titles match across services', () => {
    expect(normalizeTitle('Amélie')).toBe('amelie');
    expect(normalizeTitle('La Haine')).toBe('la haine');
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeTitle('  Blade   Runner  ')).toBe('blade runner');
  });

  it('keeps digits, which distinguish sequels', () => {
    expect(normalizeTitle('Blade Runner 2049')).toBe('blade runner 2049');
  });
});
