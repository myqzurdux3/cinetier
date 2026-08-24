import { useId } from 'react';
import { TIER_COLORS, type Tier, type TierColor } from '@/domain/tiers';
import type { BoardAction } from '@/domain/board';

interface TierRowControlsProps {
  tier: Tier;
  index: number;
  tierCount: number;
  dispatch: (action: BoardAction) => void;
}

const BUTTON =
  'rounded-card border border-line px-2 py-1 text-xs text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent disabled:opacity-40';

export function TierRowControls({ tier, index, tierCount, dispatch }: TierRowControlsProps) {
  const removeHintId = useId();

  return (
    <div className="mb-1 flex flex-wrap items-center gap-2">
      <label htmlFor={`${tier.id}-label`} className="sr-only">
        {`Row ${tier.label} label`}
      </label>
      <input
        id={`${tier.id}-label`}
        value={tier.label}
        maxLength={24}
        onChange={(event) => {
          dispatch({ type: 'renameTier', tierId: tier.id, label: event.target.value });
        }}
        className="w-28 rounded-card border border-line bg-surface px-2 py-1 text-xs text-ink focus:ring-2 focus:ring-accent"
      />

      <label htmlFor={`${tier.id}-color`} className="sr-only">
        {`Row ${tier.label} colour`}
      </label>
      <select
        id={`${tier.id}-color`}
        value={tier.color}
        onChange={(event) => {
          dispatch({
            type: 'recolorTier',
            tierId: tier.id,
            color: event.target.value as TierColor,
          });
        }}
        className="rounded-card border border-line bg-surface px-2 py-1 text-xs text-ink focus:ring-2 focus:ring-accent"
      >
        {TIER_COLORS.map((color) => (
          <option key={color} value={color}>
            {color.toUpperCase()}
          </option>
        ))}
      </select>

      <button
        type="button"
        className={BUTTON}
        onClick={() => {
          dispatch({ type: 'moveTier', tierId: tier.id, toIndex: index - 1 });
        }}
        disabled={index === 0}
      >
        {`Move row ${tier.label} up`}
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => {
          dispatch({ type: 'moveTier', tierId: tier.id, toIndex: index + 1 });
        }}
        disabled={index === tierCount - 1}
      >
        {`Move row ${tier.label} down`}
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => {
          dispatch({ type: 'addTier', afterTierId: tier.id });
        }}
      >
        {`Add a row below ${tier.label}`}
      </button>
      <button
        type="button"
        className={BUTTON}
        aria-describedby={removeHintId}
        onClick={() => {
          dispatch({ type: 'removeTier', tierId: tier.id });
        }}
        disabled={tierCount === 1}
      >
        {`Remove row ${tier.label}`}
      </button>
      <span id={removeHintId} className="sr-only">
        Removing a row returns its films to the pool; nothing is deleted.
      </span>
    </div>
  );
}
