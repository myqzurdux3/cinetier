import { describe, it, expect } from 'vitest';
import { boardFilename } from '@/domain/filename';

describe('boardFilename', () => {
  it('slugifies the board name', () => {
    expect(boardFilename('My ranking', 'png')).toBe('cinetier-my-ranking.png');
  });

  it('carries whichever extension it is given', () => {
    // The two things a board saves as have to agree on everything but this.
    expect(boardFilename('My ranking', 'json')).toBe('cinetier-my-ranking.json');
  });

  it('strips accents rather than leaving them out', () => {
    // "Chefs-d'oeuvre" should not become "chefs-d-uvre".
    expect(boardFilename('Chefs-d\u2019\u0153uvre \u00e9t\u00e9', 'png')).toBe(
      'cinetier-chefs-d-uvre-ete.png',
    );
  });

  it('drops the characters a file system refuses', () => {
    expect(boardFilename('Best / worst: 2024?', 'png')).toBe('cinetier-best-worst-2024.png');
  });

  it('falls back rather than producing a name that is only an extension', () => {
    // A board called "???" would otherwise download as ".png".
    expect(boardFilename('???', 'png')).toBe('cinetier-tier-list.png');
    expect(boardFilename('', 'json')).toBe('cinetier-tier-list.json');
  });

  it('does not leave a trailing dash from a trimmed name', () => {
    expect(boardFilename('Films! ', 'png')).toBe('cinetier-films.png');
  });

  it('cuts a very long name rather than producing a file name nothing accepts', () => {
    const name = boardFilename('x'.repeat(200), 'png');
    expect(name.length).toBeLessThanOrEqual('cinetier-'.length + 60 + '.png'.length);
  });
});
