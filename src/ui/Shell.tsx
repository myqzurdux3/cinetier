import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { PageTexture } from './PageTexture';
import { ThemeToggle } from './theme/ThemeToggle';

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="relative min-h-screen bg-screen text-ink flex flex-col">
      <PageTexture />
      <header className="relative z-10 flex items-center gap-3 px-6 py-4 border-b border-line">
        <Logo />
        <span className="font-display text-lg tracking-wide uppercase">Cinetier</span>
        <span className="ml-auto hidden text-sm text-ink-dim sm:block">
          Rank what you have already seen
        </span>
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex-1">{children}</main>

      <footer className="relative z-10 px-6 py-5 border-t border-line text-xs text-ink-dim space-y-1">
        <p>Your ratings never leave your browser. There is no account and no server.</p>
        <p>
          This product uses the TMDB API but is not endorsed or certified by TMDB. Cinetier is not
          affiliated with IMDb or Letterboxd.
        </p>
      </footer>
    </div>
  );
}
