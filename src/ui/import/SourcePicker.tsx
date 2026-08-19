export type ImportSource = 'imdb' | 'letterboxd';

interface SourcePickerProps {
  onPick: (source: ImportSource) => void;
}

const SOURCES: { id: ImportSource; name: string; blurb: string }[] = [
  { id: 'imdb', name: 'IMDb', blurb: 'Your ratings, with genres, directors and runtimes.' },
  {
    id: 'letterboxd',
    name: 'Letterboxd',
    blurb: 'Your diary, with real watch dates and rewatches.',
  },
];

export function SourcePicker({ onPick }: SourcePickerProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SOURCES.map((source) => (
        <button
          key={source.id}
          type="button"
          onClick={() => onPick(source.id)}
          className="rounded-card border border-line bg-surface p-6 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-surface-raised focus-visible:border-accent focus-visible:outline-none motion-reduce:hover:translate-y-0"
        >
          <span className="block font-display text-2xl uppercase tracking-wide">{source.name}</span>
          <span className="mt-1 block text-sm text-ink-dim">{source.blurb}</span>
        </button>
      ))}
    </div>
  );
}
