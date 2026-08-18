import { DropZone } from './DropZone';
import type { ImportOutcome } from './importFiles';
import type { ImportSource } from './SourcePicker';

interface ImportGuideProps {
  source: ImportSource;
  onBack: () => void;
  onImported: (outcome: ImportOutcome) => void;
}

const STEPS: Record<ImportSource, string[]> = {
  imdb: [
    'Sign in to IMDb and open Your Ratings.',
    'Open the ⋯ menu at the top of the list and choose Export.',
    'You will be sent a ratings.csv file — drop it below.',
  ],
  letterboxd: [
    'Sign in to Letterboxd and open Settings from your username menu.',
    'Go to the Import & Export tab and choose Export Your Data.',
    'Drop the .zip below exactly as you downloaded it — no need to unpack it.',
  ],
};

export function ImportGuide({ source, onBack, onImported }: ImportGuideProps) {
  return (
    <div className="space-y-8">
      <button type="button" onClick={onBack} className="text-sm text-ink-dim hover:text-ink">
        ← Back to the other service
      </button>

      <ol className="space-y-3">
        {STEPS[source].map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs text-ink-dim">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {source === 'imdb' && (
        <p className="rounded border border-line bg-surface p-4 text-sm text-ink-dim">
          IMDb does not export watch dates — only the date you rated a film. Cinetier uses that
          instead and labels it as an estimate, so date filters stay honest.
        </p>
      )}

      {source === 'letterboxd' && (
        <p className="rounded border border-line bg-surface p-4 text-sm text-ink-dim">
          Letterboxd currently restricts data export to Letterboxd Pro subscribers, so a free
          account cannot produce this file. An IMDb export works on any account, free or paid.
        </p>
      )}

      <DropZone onImported={onImported} />
    </div>
  );
}
