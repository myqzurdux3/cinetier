import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TierRowControls } from '@/ui/board/TierRowControls';
import { DEFAULT_TIERS, TIER_COLORS } from '@/domain/tiers';

const tier = DEFAULT_TIERS[0]!;

function renderControls(overrides: Partial<Parameters<typeof TierRowControls>[0]> = {}) {
  const dispatch = vi.fn();
  render(
    <TierRowControls tier={tier} index={0} tierCount={6} dispatch={dispatch} {...overrides} />,
  );
  return { dispatch };
}

describe('TierRowControls', () => {
  it('renames a row', () => {
    const { dispatch } = renderControls();
    fireEvent.change(screen.getByLabelText('Row S label'), { target: { value: 'Godlike' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'renameTier', tierId: 'S', label: 'Godlike' });
  });

  it('offers exactly the theme’s tier colours and no free-form input', () => {
    renderControls();
    const select = screen.getByLabelText('Row S colour');
    expect([...select.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual([
      ...TIER_COLORS,
    ]);
    expect(document.querySelector('input[type="color"]')).toBeNull();
  });

  it('recolours a row', () => {
    const { dispatch } = renderControls();
    fireEvent.change(screen.getByLabelText('Row S colour'), { target: { value: 'c' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'recolorTier', tierId: 'S', color: 'c' });
  });

  it('adds a row after this one', async () => {
    const { dispatch } = renderControls();
    await userEvent.click(screen.getByRole('button', { name: 'Add a row below S' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'addTier', afterTierId: 'S' });
  });

  it('removes a row', async () => {
    const { dispatch } = renderControls();
    await userEvent.click(screen.getByRole('button', { name: 'Remove row S' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeTier', tierId: 'S' });
  });

  it('says what removing a row does with its films, in the name of the control', () => {
    // "Remove" beside a row holding forty posters reads as "delete forty
    // films" unless the control says otherwise.
    renderControls();
    expect(screen.getByRole('button', { name: 'Remove row S' })).toHaveAccessibleDescription(
      /returns its films to the pool/i,
    );
  });

  it('cannot remove the only remaining row', () => {
    renderControls({ tierCount: 1 });
    expect(screen.getByRole('button', { name: 'Remove row S' })).toBeDisabled();
  });

  it('moves a row up and down, and stops at the ends', async () => {
    const { dispatch } = renderControls({ index: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Move row S up' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'moveTier', tierId: 'S', toIndex: 0 });

    renderControls({ index: 0 });
    expect(screen.getAllByRole('button', { name: 'Move row S up' })[1]).toBeDisabled();
  });
});
