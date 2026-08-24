import { describe, it, expect } from 'vitest';
import { classifyTitleType, mergeTitleTypes } from '@/domain/titleType';

describe('classifyTitleType', () => {
  it('classifies the English labels IMDb exports', () => {
    expect(classifyTitleType('Movie')).toBe('movie');
    expect(classifyTitleType('TV Movie')).toBe('tvMovie');
    expect(classifyTitleType('TV Series')).toBe('series');
    expect(classifyTitleType('TV Mini Series')).toBe('miniSeries');
    expect(classifyTitleType('TV Episode')).toBe('episode');
    expect(classifyTitleType('Short')).toBe('short');
    expect(classifyTitleType('Video')).toBe('movie');
  });

  it('classifies the same labels in the other languages IMDb exports in', () => {
    // The account language decides this column, so the English word is not a
    // reliable test — this is the defect that made a French export import zero films.
    expect(classifyTitleType('Film')).toBe('movie');
    expect(classifyTitleType('Série télévisée')).toBe('series');
    expect(classifyTitleType('Mini-série télévisée')).toBe('miniSeries');
    expect(classifyTitleType('Téléfilm')).toBe('tvMovie');
    expect(classifyTitleType('Court métrage')).toBe('short');
    expect(classifyTitleType('Película')).toBe('movie');
    expect(classifyTitleType('Miniserie')).toBe('miniSeries');
    expect(classifyTitleType('Filme')).toBe('movie');
    expect(classifyTitleType('Fernsehserie')).toBe('series');
  });

  it('rejects entries that are not screen titles at all', () => {
    expect(classifyTitleType('Video Game')).toBeNull();
    expect(classifyTitleType('Jeu vidéo')).toBeNull();
    expect(classifyTitleType('Podcast Series')).toBeNull();
    expect(classifyTitleType('Podcast Episode')).toBeNull();
  });

  it('falls back to "other" rather than rejecting a label it does not know', () => {
    // Rejecting would drop the row, and a row dropped for an unrecognized label
    // is how an import ends up empty with nothing to explain it.
    expect(classifyTitleType('TV Special')).toBe('other');
    expect(classifyTitleType('Holographic Broadcast')).toBe('other');
    expect(classifyTitleType('')).toBe('other');
  });
});

describe('mergeTitleTypes', () => {
  it('is symmetric in its arguments, so a merge does not depend on library order', () => {
    const types = [
      'movie',
      'tvMovie',
      'series',
      'miniSeries',
      'episode',
      'short',
      'other',
    ] as const;
    for (const a of types) {
      for (const b of types) {
        expect(mergeTitleTypes(a, b)).toBe(mergeTitleTypes(b, a));
      }
    }
  });

  it('prefers a specific claim over a blanket one', () => {
    expect(mergeTitleTypes('movie', 'series')).toBe('series');
    expect(mergeTitleTypes('other', 'movie')).toBe('movie');
    expect(mergeTitleTypes('series', 'series')).toBe('series');
  });
});
