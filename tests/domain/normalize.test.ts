import { describe, it, expect } from 'vitest';
import { normalizeTitle, titleYearKey } from '@/domain/normalize';

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

describe('titleYearKey', () => {
  it('keys on the normalized title and the year together', () => {
    expect(titleYearKey({ title: 'Amélie', year: 2001 })).toBe('title:amelie::2001');
  });

  it('distinguishes two films that share a title but not a year', () => {
    expect(titleYearKey({ title: 'Dune', year: 1984 })).not.toBe(
      titleYearKey({ title: 'Dune', year: 2021 }),
    );
  });

  it('still produces a stable key when the year is unknown', () => {
    expect(titleYearKey({ title: 'Dune', year: null })).toBe('title:dune::unknown');
  });
});
