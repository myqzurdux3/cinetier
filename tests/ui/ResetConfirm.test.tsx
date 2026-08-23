import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetConfirm } from '@/ui/ResetConfirm';

function renderConfirm(overrides: Partial<Parameters<typeof ResetConfirm>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ResetConfirm
      filmCount={800}
      boardName="My ranking"
      placedCount={120}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ResetConfirm', () => {
  it('names everything that will be destroyed, with numbers', () => {
    // A generic "are you sure?" is what lets someone delete hours of ranking
    // by reflex. The counts are the whole point of this component.
    renderConfirm();
    expect(screen.getByRole('dialog')).toHaveTextContent('800 films');
    expect(screen.getByRole('dialog')).toHaveTextContent('My ranking');
    expect(screen.getByRole('dialog')).toHaveTextContent('120 placed');
  });

  it('does nothing until the destructive action is chosen', async () => {
    const { onConfirm, onCancel } = renderConfirm();
    await userEvent.click(screen.getByRole('button', { name: /keep everything/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms on the destructive action', async () => {
    const { onConfirm } = renderConfirm();
    await userEvent.click(screen.getByRole('button', { name: /delete everything/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('does not mention a board when there is none', () => {
    renderConfirm({ boardName: null, placedCount: 0 });
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/placed/i);
  });
});
