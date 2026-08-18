import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourcePicker } from '@/ui/import/SourcePicker';

describe('SourcePicker', () => {
  it('offers both services as buttons', () => {
    render(<SourcePicker onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /imdb/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /letterboxd/i })).toBeInTheDocument();
  });

  it('reports which one was chosen', async () => {
    const onPick = vi.fn();
    render(<SourcePicker onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: /letterboxd/i }));
    expect(onPick).toHaveBeenCalledWith('letterboxd');
  });
});
