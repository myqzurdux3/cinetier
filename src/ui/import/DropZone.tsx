import { useEffect, useId, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { importFiles, type ImportOutcome } from './importFiles';

interface DropZoneProps {
  onImported: (outcome: ImportOutcome) => void;
}

export function DropZone({ onImported }: DropZoneProps) {
  const inputId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);
  // `busy` state is not readable synchronously within the same handler tick,
  // so a second drop or selection arriving before the first re-render could
  // slip past a state-only check. The ref is read-then-set immediately, so
  // it reliably blocks a second import while one is already in flight.
  const busyRef = useRef(false);

  async function handle(files: File[]) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const outcome = await importFiles(files);
      if (outcome.status === 'error') {
        setError({ message: outcome.message, hint: outcome.hint });
        return;
      }
      onImported(outcome);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handle([...event.dataTransfer.files]);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    void handle([...(input.files ?? [])]);
    // A file input keeps its selection, and re-choosing the same file fires no
    // change event — which is exactly the retry someone makes after an error.
    input.value = '';
  }

  // The file input is disabled for the length of the read, and disabling the
  // focused element blurs it — focus falls to <body>, which for a keyboard or
  // screen-reader user means starting the page again to get back. It is handed
  // to the region that is announcing the read instead.
  //
  // Guarded on <body> rather than on "was it the input": that is the condition
  // that actually matters, it is the only one that can be observed after the
  // fact, and it takes nothing away from a user who has focus somewhere else.
  useEffect(() => {
    if (busy && document.activeElement === document.body) statusRef.current?.focus();
  }, [busy]);

  return (
    <div className="mx-auto max-w-xl">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-busy={busy}
        className={[
          'rounded-lg border-2 border-dashed p-10 text-center transition-colors',
          dragging ? 'border-accent bg-surface' : 'border-line',
        ].join(' ')}
      >
        <p className="text-lg">{busy ? 'Reading your export…' : 'Drop your export here'}</p>
        <p className="mt-2 text-sm text-ink-dim">
          An IMDb <code>.csv</code>, or a Letterboxd <code>.zip</code> exactly as you downloaded it
          — or a <code>.json</code> Cinetier saved — whatever the file is named.
        </p>
        <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="sr-only">
          {busy ? 'Reading your export…' : ''}
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
          accept=".csv,.zip,.json"
          onChange={onChange}
          disabled={busy}
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
