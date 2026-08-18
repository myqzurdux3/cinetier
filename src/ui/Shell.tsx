import type { ReactNode } from 'react';
import { Logo } from './Logo';

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen bg-screen text-ink flex flex-col">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-line">
        <Logo />
        <span className="text-lg font-semibold tracking-tight">Cinetier</span>
        <span className="ml-auto text-sm text-ink-dim hidden sm:block">
          Turn your film history into a tier list
        </span>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="px-6 py-5 border-t border-line text-xs text-ink-dim space-y-1">
        <p>Your ratings never leave your browser. There is no account and no server.</p>
        <p>
          This product uses the TMDB API but is not endorsed or certified by TMDB. Cinetier is not
          affiliated with IMDb or Letterboxd.
        </p>
      </footer>
    </div>
  );
}
