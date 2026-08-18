import { useState } from 'react';
import { Shell } from './Shell';
import { SourcePicker, type ImportSource } from './import/SourcePicker';
import { ImportGuide } from './import/ImportGuide';
import type { Film } from '@/domain/film';

export default function App() {
  const [source, setSource] = useState<ImportSource | null>(null);
  const [films, setFilms] = useState<Film[] | null>(null);

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-6 py-16">
        {films !== null ? (
          <p className="text-center text-2xl">{films.length} films imported.</p>
        ) : source === null ? (
          <>
            <h1 className="mb-3 text-center text-3xl font-semibold tracking-tight">
              Turn your film history into a tier list
            </h1>
            <p className="mb-10 text-center text-ink-dim">Where do you keep your films?</p>
            <SourcePicker onPick={setSource} />
          </>
        ) : (
          <ImportGuide
            source={source}
            onBack={() => setSource(null)}
            onImported={(outcome) => outcome.status === 'ok' && setFilms(outcome.films)}
          />
        )}
      </div>
    </Shell>
  );
}
