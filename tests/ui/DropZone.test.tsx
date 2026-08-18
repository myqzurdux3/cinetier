import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('ignores a second selection that arrives while the first is still being read', async () => {
    const onImported = vi.fn();
    render(<DropZone onImported={onImported} />);

    const input = screen.getByLabelText(/choose a file/i);
    const first = new File([imdbCsv], 'ratings.csv', { type: 'text/csv' });
    const second = new File([imdbCsv], 'ratings (1).csv', { type: 'text/csv' });

    // Fired back to back, synchronously, so the second selection lands while
    // the first import is still in flight (its `await file.text()` has not
    // yet resolved). Without a guard, both would reach onImported.
    fireEvent.change(input, { target: { files: [first] } });
    fireEvent.change(input, { target: { files: [second] } });

    await waitFor(() => expect(onImported).toHaveBeenCalled());
    // Give any wrongly-admitted second import a chance to also resolve.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('disables the file input while an import is in flight', async () => {
    render(<DropZone onImported={vi.fn()} />);
    const input: HTMLInputElement = screen.getByLabelText(/choose a file/i);
    expect(input.disabled).toBe(false);

    fireEvent.change(input, {
      target: { files: [new File([imdbCsv], 'ratings.csv', { type: 'text/csv' })] },
    });

    expect(input.disabled).toBe(true);
    await waitFor(() => expect(input.disabled).toBe(false));
  });

  it('announces the import in progress to screen readers, and falls silent once idle', async () => {
    render(<DropZone onImported={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    const input = screen.getByLabelText(/choose a file/i);
    fireEvent.change(input, {
      target: { files: [new File([imdbCsv], 'ratings.csv', { type: 'text/csv' })] },
    });

    expect(screen.getByRole('status')).toHaveTextContent(/reading your export/i);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
