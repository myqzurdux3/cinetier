import type { ReactNode } from 'react';

interface FilterSectionProps {
  title: string;
  /** How many titles this section's own criteria admit, of the whole library. */
  count: number;
  total: number;
  defaultOpen?: boolean;
  disabled?: boolean;
  /** Why the section cannot be used yet. Shown in place of its controls. */
  disabledNote?: string;
  children: ReactNode;
}

/**
 * One collapsible group of controls, headed by the number of titles it admits
 * on its own — so a reader with eleven criteria set can see which one is doing
 * the cutting.
 *
 * A real <details>/<summary>, not a div that looks clickable: the disclosure has
 * to be reachable by keyboard and announced as one.
 */
export function FilterSection({
  title,
  count,
  total,
  defaultOpen = false,
  disabled = false,
  disabledNote,
  children,
}: FilterSectionProps) {
  return (
    <details open={defaultOpen} className="rounded-card border border-line bg-surface">
      {/*
        The accent ring, like every other focusable thing in the rail. A
        closed section's summary is its only keyboard-operable part, and it
        was the one control still wearing the browser's own outline.
      */}
      <summary className="flex cursor-pointer items-baseline justify-between gap-2 rounded-card px-3 py-2 font-display text-sm uppercase tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span>{title}</span>
        <span className="text-xs text-ink-dim">
          {count === total ? total : `${count} / ${total}`}
        </span>
      </summary>
      <fieldset disabled={disabled} className="space-y-2 px-3 pb-3 disabled:opacity-60">
        <legend className="sr-only">{title}</legend>
        {disabled && disabledNote ? (
          <p className="text-xs text-ink-dim">{disabledNote}</p>
        ) : (
          children
        )}
      </fieldset>
    </details>
  );
}
