import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadTheme, saveTheme, applyTheme, DEFAULT_THEME, THEMES } from '@/services/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme persistence', () => {
  it('falls back to the default theme when nothing was ever chosen', () => {
    expect(loadTheme()).toBe(DEFAULT_THEME);
  });

  it('round-trips a chosen theme', () => {
    saveTheme('neon');
    expect(loadTheme()).toBe('neon');
  });

  it('ignores a stored value that is not a theme', () => {
    // A hand-edited or stale key must not put the app in an unstyled state.
    localStorage.setItem('cinetier:theme', 'midnight-hacker');
    expect(loadTheme()).toBe(DEFAULT_THEME);
  });

  it('falls back instead of throwing when storage is unavailable', () => {
    // Private browsing and blocked-storage settings make these throw, and a
    // throw here happens before the first paint — the whole page would be lost.
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    });
    expect(loadTheme()).toBe(DEFAULT_THEME);
    expect(() => saveTheme('neon')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('marks the document so the neon tokens take effect', () => {
    applyTheme('neon');
    expect(document.documentElement.dataset.theme).toBe('neon');
  });

  it('removes the marker for the default theme rather than naming it', () => {
    // The default theme lives on :root with no selector, so the attribute must
    // come off — leaving data-theme="cinema" would work only by accident.
    applyTheme('neon');
    applyTheme('cinema');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('the inline no-flash script', () => {
  // index.html cannot import the service — a module request before first
  // paint is the very delay the inline script exists to avoid — so the
  // storage key and theme name are duplicated there on purpose. This is what
  // keeps that copy honest: it fails if either side is renamed.
  const html = readFileSync('index.html', 'utf8');

  it('reads the same storage key the service writes', () => {
    saveTheme('neon');
    const key = Object.keys(localStorage).find((k) => localStorage.getItem(k) === 'neon')!;
    expect(html).toContain(key);
  });

  it('applies every theme that is not the default', () => {
    // Asserting the theme name alone is satisfied by the comment a few lines
    // above the script (which says "neon" too), so mutating the script's
    // comparison — t === 'neon' to t === 'noen' — would leave this green
    // while every neon reader gets a flash of the wrong theme. Asserting the
    // exact comparison expression closes that hole.
    for (const theme of THEMES.filter((t) => t !== DEFAULT_THEME)) {
      expect(html).toContain(`t === '${theme}'`);
    }
  });
});
