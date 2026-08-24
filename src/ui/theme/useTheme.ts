import { useCallback, useState } from 'react';
import { loadTheme, saveTheme, applyTheme, type ThemeName } from '@/services/theme';

/**
 * The theme as React state. The document attribute is the source of truth for
 * styling; this only keeps the control's label in step with it.
 */
export function useTheme(): { theme: ThemeName; setTheme: (theme: ThemeName) => void } {
  const [theme, setThemeState] = useState<ThemeName>(() => loadTheme());

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    saveTheme(next);
    applyTheme(next);
  }, []);

  return { theme, setTheme };
}
