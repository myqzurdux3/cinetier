import type { Film, FilmSource } from './film';
import { normalizeTitle } from './normalize';

/**
 * Combine one record of the same film from two services.
 * Watch history comes from whichever record has a precise date; metadata comes
 * from whichever record actually has it. Neither service is authoritative for both.
 */
function mergeFilm(base: Film, incoming: Film): Film {
  const incomingHasBetterDate =
    incoming.watchedAt !== null &&
    (base.watchedAt === null || (base.watchedAtIsApproximate && !incoming.watchedAtIsApproximate));

  return {
    ...base,
    imdbId: base.imdbId ?? incoming.imdbId,
    tmdbId: base.tmdbId ?? incoming.tmdbId,
    year: base.year ?? incoming.year,
    rating: base.rating ?? incoming.rating,
    ratingScale: base.rating !== null ? base.ratingScale : incoming.ratingScale,
    watchedAt: incomingHasBetterDate ? incoming.watchedAt : base.watchedAt,
    watchedAtIsApproximate: incomingHasBetterDate
      ? incoming.watchedAtIsApproximate
      : base.watchedAtIsApproximate,
    isRewatch: base.isRewatch || incoming.isRewatch,
    genres: base.genres.length > 0 ? base.genres : incoming.genres,
    directors: base.directors.length > 0 ? base.directors : incoming.directors,
    runtimeMinutes: base.runtimeMinutes ?? incoming.runtimeMinutes,
    publicRating: base.publicRating ?? incoming.publicRating,
    posterPath: base.posterPath ?? incoming.posterPath,
  };
}

/** The identifier two records must share to be the same film, or null when there is none. */
function identifierKey(film: Pick<Film, 'imdbId'>): string | null {
  return film.imdbId === null ? null : `imdb:${film.imdbId}`;
}

/** The fallback key, used whenever either side of a comparison lacks an identifier. */
function titleKey(film: Pick<Film, 'title' | 'year'>): string {
  return `title:${normalizeTitle(film.title)}::${film.year ?? 'unknown'}`;
}

/**
 * IMDb is the authority on metadata, so its records fold first and become the base
 * their Letterboxd counterparts are merged into. (Watch history still goes the other
 * way: mergeFilm lets a precise date displace an approximate one from either side.)
 */
const SOURCE_ORDER: Record<FilmSource, number> = { imdb: 0, letterboxd: 1 };

/**
 * The sort key that fixes the fold order: source first, then a fingerprint of
 * everything else the record holds. The fingerprint only breaks ties, so that the
 * merged result depends on which records are present and never on the order they
 * arrived in. Records with equal keys are field-for-field identical, so their
 * relative order cannot change the outcome either.
 */
function foldKey(film: Film): string {
  return [
    SOURCE_ORDER[film.source],
    film.id,
    film.imdbId ?? '',
    film.tmdbId ?? '',
    film.title,
    film.year ?? '',
    film.rating ?? '',
    film.ratingScale,
    film.watchedAt?.toISOString() ?? '',
    film.watchedAtIsApproximate,
    film.isRewatch,
    film.genres.join(','),
    film.directors.join(','),
    film.runtimeMinutes ?? '',
    film.publicRating ?? '',
    film.posterPath ?? '',
  ].join('\u0000');
}

/** Order records by foldKey, computing each key once rather than per comparison. */
function sortByFoldOrder(films: readonly Film[]): Film[] {
  return films
    .map((film) => ({ film, key: foldKey(film) }))
    .sort((a, b) => (a.key === b.key ? 0 : a.key < b.key ? -1 : 1))
    .map((entry) => entry.film);
}

/**
 * Combine any number of imported libraries into one, without duplicate films.
 *
 * Two records describe the same film when they share an IMDb identifier, or, when
 * either of them lacks one, when their normalized title and year match. That relation
 * is transitive: a Letterboxd record matched by title to an IMDb record is also the same
 * film as every other record carrying that IMDb identifier, whatever title it happens to
 * display. So the records are treated as a graph, matches as edges, and each connected
 * component as one film. A key that ever linked a record into a component keeps doing so,
 * which a map from the merged record's own current fields cannot express.
 *
 * The result is a function of which records were passed, not of the order the libraries
 * or the rows inside them arrived in.
 */
export function mergeLibraries(...libraries: Film[][]): Film[] {
  const films = libraries.flat();
  const parent = films.map((_, index) => index);

  function find(index: number): number {
    let root = index;
    while (parent[root]! !== root) root = parent[root]!;

    let cursor = index;
    while (parent[cursor]! !== root) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  const firstByIdentifier = new Map<string, number>();
  const groupsByTitle = new Map<string, number[]>();

  for (const [index, film] of films.entries()) {
    const identifier = identifierKey(film);
    if (identifier !== null) {
      const first = firstByIdentifier.get(identifier);
      if (first === undefined) firstByIdentifier.set(identifier, index);
      else union(first, index);
    }

    const title = titleKey(film);
    const group = groupsByTitle.get(title);
    if (group === undefined) groupsByTitle.set(title, [index]);
    else group.push(index);
  }

  for (const group of groupsByTitle.values()) {
    // Title and year only settle the question when one side has no identifier. Two
    // records that each carry a different identifier are different films (a remake
    // released the same year as the original, say), however alike their titles read.
    const anchor = group.find((index) => films[index]!.imdbId === null);
    if (anchor === undefined) continue;
    for (const index of group) union(anchor, index);
  }

  const components = new Map<number, Film[]>();
  for (const [index, film] of films.entries()) {
    const root = find(index);
    const component = components.get(root);
    if (component === undefined) components.set(root, [film]);
    else component.push(film);
  }

  const merged = [...components.values()].map((component) =>
    sortByFoldOrder(component).reduce((base, incoming) => mergeFilm(base, incoming)),
  );

  return sortByFoldOrder(merged);
}
