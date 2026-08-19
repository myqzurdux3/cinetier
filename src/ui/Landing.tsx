import { SourcePicker, type ImportSource } from './import/SourcePicker';

interface LandingProps {
  onPick: (source: ImportSource) => void;
}

const TIERS = [
  { letter: 'S', token: 'tier-s' },
  { letter: 'A', token: 'tier-a' },
  { letter: 'B', token: 'tier-b' },
  { letter: 'C', token: 'tier-c' },
  { letter: 'D', token: 'tier-d' },
  { letter: 'F', token: 'tier-f' },
];

export function Landing({ onPick }: LandingProps) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <div className="space-y-4">
        <h1 className="font-display text-6xl uppercase leading-none tracking-wide sm:text-8xl">
          Cinetier
        </h1>
        <p className="max-w-xl text-lg text-ink-dim">
          Rank everything you have already watched. Drop in your IMDb or Letterboxd export and it
          becomes a tier list.
        </p>
      </div>

      {/* The product's signature, and the plainest possible statement of what it
          makes. The letter rides on every band: colour alone never names a tier. */}
      <div className="flex overflow-hidden rounded-card">
        {TIERS.map((tier) => (
          <div
            key={tier.letter}
            className="flex-1 py-2 text-center font-display text-sm tracking-widest text-on-accent"
            style={{ backgroundColor: `var(--color-${tier.token})` }}
          >
            {tier.letter}
          </div>
        ))}
      </div>

      <SourcePicker onPick={onPick} />

      <p className="text-sm text-ink-dim">
        Your ratings never leave your browser. There is no account and no server.
      </p>
    </div>
  );
}
