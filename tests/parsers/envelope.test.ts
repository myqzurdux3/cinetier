import { describe, it, expect } from 'vitest';
import { buildEnvelope, parseEnvelope, ENVELOPE_VERSION } from '@/parsers/envelope';
import { ParseError } from '@/parsers/types';
import { createBoard, moveFilm } from '@/domain/tiers';
import type { Film } from '@/domain/film';

function film(id: string, overrides: Partial<Film> = {}): Film {
  return {
    id,
    imdbId: 'tt0000001',
    tmdbId: 603,
    title: id,
    year: 1999,
    titleType: 'movie',
    rating: 90,
    ratingScale: 'imdb10',
    watchedAt: new Date('2024-06-01T00:00:00.000Z'),
    watchedAtIsApproximate: true,
    isRewatch: false,
    genres: ['Drama'],
    directors: ['Someone'],
    runtimeMinutes: 120,
    publicRating: 80,
    posterPath: '/a.jpg',
    detailsFetched: true,
    source: 'imdb',
    ...overrides,
  };
}

const AT = new Date('2026-08-24T12:00:00.000Z');

function envelopeOf(films: Film[], board = createBoard('b1', 'Mine')) {
  return buildEnvelope(films, board, AT);
}

/** The envelope as a plain object, for tests that damage one field. */
function damaged(mutate: (raw: Record<string, unknown>) => void): string {
  const board = moveFilm(createBoard('b1', 'Mine'), 'a', { tierId: 'S', index: 0 });
  const raw = JSON.parse(envelopeOf([film('a')], board)) as Record<string, unknown>;
  mutate(raw);
  return JSON.stringify(raw);
}

describe('buildEnvelope', () => {
  it('round-trips a library and a board', () => {
    const board = moveFilm(createBoard('b1', 'Mine'), 'a', { tierId: 'S', index: 0 });
    const films = [film('a'), film('b', { rating: null, watchedAt: null, posterPath: null })];

    const result = parseEnvelope(envelopeOf(films, board));

    expect(result.films).toEqual(films);
    expect(result.board).toEqual(board);
    expect(result.warnings).toEqual([]);
  });

  it('brings watch dates back as Dates, not strings', () => {
    // JSON has no date type; without a reviver every filter that compares
    // dates would be comparing strings and quietly answering nonsense.
    const result = parseEnvelope(envelopeOf([film('a')]));
    expect(result.films[0]!.watchedAt).toBeInstanceOf(Date);
    expect(result.films[0]!.watchedAt!.toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });

  it('says which version wrote it, and when', () => {
    const raw = JSON.parse(envelopeOf([film('a')])) as Record<string, unknown>;
    expect(raw['cinetier']).toBe(ENVELOPE_VERSION);
    expect(raw['exportedAt']).toBe(AT.toISOString());
  });
});

describe('parseEnvelope refuses', () => {
  const refuses = (text: string, matcher: RegExp) => {
    expect(() => parseEnvelope(text)).toThrow(ParseError);
    expect(() => parseEnvelope(text)).toThrow(matcher);
  };

  it('an empty file', () => refuses('', /empty/i));
  it('text that is not JSON', () => refuses('not json at all', /valid JSON/i));
  it('JSON that is not an object', () => refuses('[1, 2, 3]', /not a Cinetier export/i));
  it('an object with no version', () => refuses('{"films":[],"board":{}}', /which version/i));

  it('a file from a newer format', () => {
    // Refusing is the honest answer: a format this one does not know could
    // carry a board shape it would silently mangle.
    refuses(
      damaged((raw) => (raw['cinetier'] = ENVELOPE_VERSION + 1)),
      /newer version/i,
    );
  });

  it('a film with no id', () =>
    refuses(
      damaged((raw) => delete (raw['films'] as Record<string, unknown>[])[0]!['id']),
      /no id/i,
    ));

  it('a film whose type is not one this version knows', () =>
    refuses(
      damaged((raw) => ((raw['films'] as Record<string, unknown>[])[0]!['titleType'] = 'hologram')),
      /unknown type/i,
    ));

  it('a film whose rating scale is not one this version knows', () =>
    refuses(
      damaged((raw) => ((raw['films'] as Record<string, unknown>[])[0]!['ratingScale'] = 'stars')),
      /unknown rating scale/i,
    ));

  it('a rating that is not a number', () =>
    refuses(
      damaged((raw) => ((raw['films'] as Record<string, unknown>[])[0]!['rating'] = '90')),
      /malformed rating/i,
    ));

  it('a board with no rows', () =>
    refuses(
      damaged((raw) => ((raw['board'] as Record<string, unknown>)['tiers'] = [])),
      /no rows/i,
    ));

  it('a row with a colour this version does not have', () =>
    refuses(
      damaged((raw) => {
        const tiers = (raw['board'] as Record<string, unknown>)['tiers'] as Record<
          string,
          unknown
        >[];
        tiers[0]!['color'] = 'chartreuse';
      }),
      /unknown colour/i,
    ));

  it('a file carrying no films at all', () =>
    refuses(
      damaged((raw) => (raw['films'] = [])),
      /no films/i,
    ));
});

describe('parseEnvelope tolerates', () => {
  it('a placement naming a film the file does not carry', () => {
    // The rest of the ranking is still the user's work. Refusing all of it
    // over one stale id would be the more destructive answer.
    const text = damaged((raw) => {
      const placements = (raw['board'] as Record<string, unknown>)['placements'] as Record<
        string,
        string[]
      >;
      placements['S'] = ['a', 'ghost'];
    });
    const result = parseEnvelope(text);

    expect(result.board.placements['S']).toEqual(['a']);
    expect(result.warnings).toEqual(['One placed film was not in the file and has been left out.']);
  });

  it('a placement naming a row the file does not define', () => {
    const text = damaged((raw) => {
      const placements = (raw['board'] as Record<string, unknown>)['placements'] as Record<
        string,
        string[]
      >;
      placements['Z'] = ['a'];
    });
    const result = parseEnvelope(text);

    expect(Object.keys(result.board.placements).sort()).toEqual(['A', 'B', 'C', 'D', 'F', 'S']);
    expect(result.warnings[0]).toMatch(/left out/);
  });

  it('an unreadable watch date, at the cost of that one date', () => {
    const text = damaged(
      (raw) => ((raw['films'] as Record<string, unknown>[])[0]!['watchedAt'] = 'never'),
    );
    const result = parseEnvelope(text);

    expect(result.films[0]!.watchedAt).toBeNull();
    expect(result.warnings).toEqual(['Ignored an unreadable watch date for "a".']);
  });

  it('a film that was never watched on a date at all', () => {
    const text = damaged(
      (raw) => ((raw['films'] as Record<string, unknown>[])[0]!['watchedAt'] = null),
    );
    expect(parseEnvelope(text).films[0]!.watchedAt).toBeNull();
    expect(parseEnvelope(text).warnings).toEqual([]);
  });

  it('a row of the board that holds nothing', () => {
    const result = parseEnvelope(envelopeOf([film('a')]));
    expect(result.board.placements['S']).toEqual([]);
  });
});
