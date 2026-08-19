import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Landing } from '@/ui/Landing';

describe('Landing', () => {
  it("says what the product makes, in the reader's terms", () => {
    render(<Landing onPick={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/cinetier/i);
    expect(screen.getByText(/already (watched|seen)/i)).toBeInTheDocument();
  });

  it('shows the six tiers as the product signature, each with its letter', () => {
    render(<Landing onPick={vi.fn()} />);
    // Colour alone never identifies a tier: a reader who cannot separate the
    // hues still has to be able to read the board this product exists to make.
    for (const letter of ['S', 'A', 'B', 'C', 'D', 'F']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }
  });

  it('promotes the privacy promise out of the fine print', () => {
    render(<Landing onPick={vi.fn()} />);
    expect(screen.getByText(/never leave your browser/i)).toBeInTheDocument();
  });

  it('hands the chosen service back', async () => {
    const onPick = vi.fn();
    render(<Landing onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: /imdb/i }));
    expect(onPick).toHaveBeenCalledWith('imdb');
  });
});
