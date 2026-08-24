export type ThemeName = 'cinema' | 'neon';

export const THEMES: readonly ThemeName[] = ['cinema', 'neon'];
export const DEFAULT_THEME: ThemeName = 'cinema';

const KEY = 'cinetier:theme';

function isTheme(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * The chosen theme, or the default.
 *
 * localStorage rather than IndexedDB because this has to be readable
 * synchronously before React mounts; an asynchronous read would show the
 * default theme for a frame on every visit.
 */
export function loadTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Private mode and blocked-storage settings throw here. A theme is a
    // preference; losing it costs nothing, and throwing would cost the page.
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // As above: the choice simply will not survive the session.
  }
}

/** The default theme's values live on :root, so it is the absence of a marker. */
export function applyTheme(theme: ThemeName): void {
  if (theme === DEFAULT_THEME) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
}
