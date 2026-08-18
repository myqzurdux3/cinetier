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
          className="rounded-lg border border-line bg-surface p-6 text-left transition-colors hover:border-accent"
        >
          <span className="block text-xl font-semibold">{source.name}</span>
          <span className="mt-1 block text-sm text-ink-dim">{source.blurb}</span>
        </button>
      ))}
    </div>
  );
}
