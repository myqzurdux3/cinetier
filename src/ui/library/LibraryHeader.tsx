import { LibrarySummary } from './LibrarySummary';
import type { ComponentProps } from 'react';

type LibraryHeaderProps = ComponentProps<typeof LibrarySummary>;

/**
 * The library's header band. LibrarySummary still owns every count and every
 * warning; this only gives them somewhere to sit that reads as a section of a
 * page rather than a sentence stranded above a grid.
 */
export function LibraryHeader(props: LibraryHeaderProps) {
  return (
    <header className="space-y-3 rounded-card bg-surface px-5 py-4">
      <h2 className="font-display text-sm uppercase tracking-widest text-ink-dim">Your library</h2>
      <LibrarySummary {...props} />
    </header>
  );
}
