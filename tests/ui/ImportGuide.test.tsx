import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportGuide } from '@/ui/import/ImportGuide';

describe('ImportGuide', () => {
  it('gives IMDb-specific instructions naming the file to expect', () => {
    render(<ImportGuide source="imdb" onBack={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByRole('list')).toHaveTextContent(/Your Ratings/i);
    expect(screen.getByRole('list')).toHaveTextContent(/ratings\.csv/i);
  });

  it('gives Letterboxd-specific instructions naming where the export lives', () => {
    render(<ImportGuide source="letterboxd" onBack={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByRole('list')).toHaveTextContent(/Settings/i);
    expect(screen.getByRole('list')).toHaveTextContent(/Export your data/i);
    expect(screen.getByRole('list')).toHaveTextContent(/Import & Export/i);
    expect(screen.getByRole('list')).not.toHaveTextContent(/Data tab/i);
  });

  it('warns IMDb users that their watch dates are really rating dates', () => {
    render(<ImportGuide source="imdb" onBack={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByText(/does not export watch dates/i)).toBeInTheDocument();
  });

  it('lets the visitor go back and choose the other service', async () => {
    const onBack = vi.fn();
    render(<ImportGuide source="imdb" onBack={onBack} onImported={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('warns Letterboxd users that export requires a Pro subscription', () => {
    render(<ImportGuide source="letterboxd" onBack={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByText(/Letterboxd Pro/i)).toBeInTheDocument();
  });
});
