/**
 * What kind of title a library entry is.
 *
 * IMDb exports carry this as a *localized* label — a French account exports
 * "Série télévisée" where an English one exports "TV Series" — so the raw
 * string can never be compared against a fixed value. Everything downstream
 * uses this normalized type instead.
 */
export type TitleType =
  'movie' | 'tvMovie' | 'series' | 'miniSeries' | 'episode' | 'short' | 'other';

/** Lowercase, strip accents, and reduce punctuation to spaces, so "Mini-série" meets "miniserie". */
function normalize(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Classify a localized IMDb "Title Type" label.
 *
 * Returns null for entries that are not watchable screen titles at all (video
 * games, podcasts) — those are dropped. Everything else is kept: an unrecognized
 * label becomes 'other' rather than disappearing, because silently discarding
 * rows we failed to understand is how an import ends up empty with no
 * explanation. Recognition is by substring across languages, since the words
 * for "series" and "film" share a root in every locale IMDb exports in.
 */
export function classifyTitleType(label: string): TitleType | null {
  const text = normalize(label);
  if (text === '') return 'other';

  // Not screen titles. Checked first: "Video Game" also contains "video".
  if (text.includes('podcast') || text.includes('game') || text.includes('jeu')) return null;

  if (text.includes('serie')) {
    return text.includes('mini') ? 'miniSeries' : 'series';
  }
  if (text.includes('episod')) return 'episode';
  if (text.includes('short') || text.includes('court') || text.includes('kurz')) return 'short';

  // Before the plain-film check: every one of these contains "film" too.
  if (text.includes('telefilm') || text.includes('tv movie') || text.includes('film tv')) {
    return 'tvMovie';
  }
  if (
    text.includes('film') ||
    text.includes('movie') ||
    text.includes('pelicula') ||
    text.includes('video')
  ) {
    return 'movie';
  }

  return 'other';
}

/**
 * How to name a type in the interface. Both forms are spelled out because
 * "series" and "mini-series" are already plural — adding an -s produces
 * "seriess", which is what naive pluralization does here.
 */
export const TITLE_TYPE_LABELS: Record<TitleType, { one: string; many: string }> = {
  movie: { one: 'film', many: 'films' },
  tvMovie: { one: 'TV film', many: 'TV films' },
  series: { one: 'series', many: 'series' },
  miniSeries: { one: 'mini-series', many: 'mini-series' },
  episode: { one: 'episode', many: 'episodes' },
  short: { one: 'short', many: 'shorts' },
  other: { one: 'other title', many: 'other titles' },
};

/**
 * How much a type claim is worth when two records of the same title disagree.
 *
 * Letterboxd catalogues films only, so every record it produces claims 'movie'
 * whether or not anyone checked; an IMDb export carries a label the service
 * actually assigned. A specific claim therefore outranks a blanket one, and
 * 'other' — the label for something nobody could classify — outranks nothing.
 * Ranking rather than preferring one source keeps the merge independent of the
 * order the libraries arrive in.
 */
const SPECIFICITY: Record<TitleType, number> = {
  other: 0,
  movie: 1,
  short: 2,
  tvMovie: 3,
  episode: 4,
  series: 5,
  miniSeries: 6,
};

/** Reconcile the types of two records of the same title. Symmetric in its arguments. */
export function mergeTitleTypes(a: TitleType, b: TitleType): TitleType {
  return SPECIFICITY[b] > SPECIFICITY[a] ? b : a;
}
