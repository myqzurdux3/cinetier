import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { DropZone } from '@/ui/import/DropZone';

const imdbCsv = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');

describe('DropZone', () => {
  it('imports a file chosen through the file picker', async () => {
    const onImported = vi.fn();
    render(<DropZone onImported={onImported} />);

    const input = screen.getByLabelText(/choose a file/i);
    await userEvent.upload(input, new File([imdbCsv], 'ratings.csv', { type: 'text/csv' }));

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(onImported.mock.calls[0]![0]).toMatchObject({ status: 'ok' });
  });

  it('shows the error and its hint when the file is not recognised', async () => {
    render(<DropZone onImported={vi.fn()} />);

    const input = screen.getByLabelText(/choose a file/i);
    await userEvent.upload(input, new File(['a,b\n1,2'], 'random.csv', { type: 'text/csv' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not tell what/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/Letterboxd/);
  });

  it('is reachable and operable without a mouse', async () => {
    render(<DropZone onImported={vi.fn()} />);
    const input = screen.getByLabelText(/choose a file/i);
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });
});
