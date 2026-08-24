import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportGuide } from '@/ui/import/ImportGuide';

describe('ImportGuide', () => {
  it('gives IMDb-specific instructions naming the file to expect', () => {
    render(<ImportGuide source="imdb" onBack={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByRole('list')).toHaveTextContent(/Your Ratings/i);
    expect(screen.getByRole('list')).toHaveTextContent(/\.csv/i);
  });

  it('does not promise a file named ratings.csv, which IMDb no longer sends', () => {
    // The export arrives named after a random identifier; naming ratings.csv
    // sends people hunting for a file that is not in their downloads.
    render(<ImportGuide source="imdb" onBack={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByRole('list')).not.toHaveTextContent(/ratings\.csv/i);
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

  it('raises a possible Pro requirement as a conditional, never as a flat fact', () => {
    // Whether Letterboxd gates export behind Pro could not be verified: the
    // official pages refuse automated fetches and the secondary sources
    // disagree. Saying it flatly would turn away most users of one of the two
    // supported services on an unverified premise; saying nothing would leave
    // them at a paywalled dead end. The conditional is honest either way, so
    // this pins the conditional itself, not merely a mention of Pro.
    render(<ImportGuide source="letterboxd" onBack={vi.fn()} onImported={vi.fn()} />);
    const note = screen.getByText(/Pro subscription/i);
    expect(note).toHaveTextContent(
      /if you do not see an export option in your settings, Letterboxd may require a Pro subscription/i,
    );
    expect(note).not.toHaveTextContent(/restricts|is restricted|cannot produce|requires a Pro/i);
  });
});
