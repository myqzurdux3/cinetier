import { useId, useState, type DragEvent, type ChangeEvent } from 'react';
import { importFiles, type ImportOutcome } from './importFiles';

interface DropZoneProps {
  onImported: (outcome: ImportOutcome) => void;
}

export function DropZone({ onImported }: DropZoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);

  async function handle(files: File[]) {
    setBusy(true);
    setError(null);
    const outcome = await importFiles(files);
    setBusy(false);
    if (outcome.status === 'error') {
      setError({ message: outcome.message, hint: outcome.hint });
      return;
    }
    onImported(outcome);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handle([...event.dataTransfer.files]);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    void handle([...(event.target.files ?? [])]);
  }

  return (
    <div className="mx-auto max-w-xl">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          'rounded-lg border-2 border-dashed p-10 text-center transition-colors',
          dragging ? 'border-accent bg-surface' : 'border-line',
        ].join(' ')}
      >
        <p className="text-lg">{busy ? 'Reading your export…' : 'Drop your export here'}</p>
        <p className="mt-2 text-sm text-ink-dim">
          An IMDb <code>ratings.csv</code>, or a Letterboxd <code>.zip</code> exactly as you
          downloaded it.
        </p>

        <label
          htmlFor={inputId}
          className="mt-5 inline-block cursor-pointer rounded bg-accent px-4 py-2 text-sm font-medium text-screen"
        >
          Choose a file
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          accept=".csv,.zip"
          onChange={onChange}
          className="sr-only"
        />
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded border border-danger/40 bg-danger/10 p-4 text-sm">
          <p className="font-medium text-danger">{error.message}</p>
          <p className="mt-1 text-ink-dim">{error.hint}</p>
        </div>
      )}
    </div>
  );
}
