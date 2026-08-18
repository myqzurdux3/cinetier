import { Shell } from './Shell';

export default function App() {
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Turn your film history into a tier list
        </h1>
        <p className="mt-4 text-ink-dim">
          Import your IMDb or Letterboxd export, filter it however you like, and rank it.
        </p>
      </div>
    </Shell>
  );
}
