import { describe, it, expect } from 'vitest';
import { normalizeTitle, matchKey } from '@/domain/normalize';

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

describe('matchKey', () => {
  it('prefers the IMDb identifier when present', () => {
    expect(matchKey({ imdbId: 'tt0133093', title: 'The Matrix', year: 1999 })).toBe(
      'imdb:tt0133093',
    );
  });

  it('falls back to normalized title and year', () => {
    expect(matchKey({ imdbId: null, title: 'The Matrix', year: 1999 })).toBe(
      'title:the matrix::1999',
    );
  });

  it('distinguishes remakes released in different years', () => {
    const original = matchKey({ imdbId: null, title: 'Dune', year: 1984 });
    const remake = matchKey({ imdbId: null, title: 'Dune', year: 2021 });
    expect(original).not.toBe(remake);
  });

  it('handles a missing year without collapsing unrelated films', () => {
    expect(matchKey({ imdbId: null, title: 'Dune', year: null })).toBe('title:dune::unknown');
  });
});
