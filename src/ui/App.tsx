import { useState } from 'react';
import { Shell } from './Shell';
import { DropZone } from './import/DropZone';
import type { Film } from '@/domain/film';

export default function App() {
  const [films, setFilms] = useState<Film[] | null>(null);

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-6 py-16">
        {films === null ? (
          <>
            <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight">
              Turn your film history into a tier list
            </h1>
            <DropZone
              onImported={(outcome) => outcome.status === 'ok' && setFilms(outcome.films)}
            />
          </>
        ) : (
          <p className="text-center text-2xl">{films.length} films imported.</p>
        )}
      </div>
    </Shell>
  );
}
