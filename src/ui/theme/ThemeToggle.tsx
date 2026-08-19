import { useTheme } from './useTheme';
import type { ThemeName } from '@/services/theme';

const NEXT: Record<ThemeName, { theme: ThemeName; label: string }> = {
  cinema: { theme: 'neon', label: 'Néon' },
  neon: { theme: 'cinema', label: 'Salle obscure' },
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = NEXT[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next.theme)}
      // The label names the destination, not the current state: a control
      // labelled with what you already have tells you nothing about the click.
      aria-label={`Switch to the ${next.label} theme`}
      className="rounded-full border border-line px-3 py-1 text-xs tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-ink"
    >
      {next.label}
    </button>
  );
}
