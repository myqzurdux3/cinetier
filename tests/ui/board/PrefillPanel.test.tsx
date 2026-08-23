import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefillPanel } from '@/ui/board/PrefillPanel';
import { createBoard, moveFilm } from '@/domain/tiers';
import { makeFilm } from '../../support/film';

const heat = makeFilm({ title: 'Heat', rating: 95 });
const dune = makeFilm({ title: 'Dune', rating: 82 });
const unrated = makeFilm({ title: 'Unrated', rating: null });
const films = [heat, dune, unrated];

function renderPanel(overrides: Partial<Parameters<typeof PrefillPanel>[0]> = {}) {
  const dispatch = vi.fn();
  render(
    <PrefillPanel
      board={createBoard('b1', 'Mine')}
      films={films}
      dispatch={dispatch}
      {...overrides}
    />,
  );
  return { dispatch };
}

describe('PrefillPanel', () => {
  it('shows how many pooled films each threshold would place', () => {
    renderPanel();
    expect(screen.getByRole('group', { name: /thresholds/i })).toBeInTheDocument();
    expect(screen.getByLabelText('S — lowest rating')).toHaveValue(90);
    expect(screen.getByText('S would take 1')).toBeInTheDocument();
    expect(screen.getByText('A would take 1')).toBeInTheDocument();
  });

  it('counts only films that are still in the pool', () => {
    // Pre-filling never rearranges a hand-placed film, so a count that
    // included one would promise something the action does not do.
    const placed = moveFilm(createBoard('b1', 'Mine'), heat.id, { tierId: 'F', index: 0 });
    renderPanel({ board: placed });
    expect(screen.getByText('S would take 0')).toBeInTheDocument();
  });

  it('does not count a film that is already sitting in the tier it previews', () => {
    // Pre-fill leaves a hand-placed film exactly where it is, so previewing
    // that tier must show zero gain, not the tier's whole occupancy.
    const alreadyInS = moveFilm(createBoard('b1', 'Mine'), heat.id, { tierId: 'S', index: 0 });
    renderPanel({ board: alreadyInS });
    expect(screen.getByText('S would take 0')).toBeInTheDocument();
  });

  it('says how many films it will not place at all', () => {
    renderPanel();
    expect(screen.getByText(/1 unrated film stays in the pool/i)).toBeInTheDocument();
  });

  it('changing a threshold dispatches, and does not pre-fill by itself', () => {
    // Editing a number must not move anything: the effect is previewed, then
    // applied on purpose.
    const { dispatch } = renderPanel();
    fireEvent.change(screen.getByLabelText('S — lowest rating'), { target: { value: '97' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setThreshold', tierId: 'S', minRating: 97 });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'prefill' }));
  });

  it('applies the pre-fill on the action, with the library it was shown', async () => {
    const { dispatch } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /pre-fill from my ratings/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'prefill', films });
  });

  it('sends everything back to the pool on the inverse action', async () => {
    const { dispatch } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /send everything back/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearToPool' });
  });
});
