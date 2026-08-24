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
      {/*
        The h1 of this screen. It was an h2 under no h1 at all — the wordmark
        in the shell is a span, and the landing page's own h1 is gone by the
        time this renders — which axe reports and a screen reader's heading
        list shows as a document that starts at level two.
      */}
      <h1 className="font-display text-sm uppercase tracking-widest text-ink-dim">Your library</h1>
      <LibrarySummary {...props} />
    </header>
  );
}
