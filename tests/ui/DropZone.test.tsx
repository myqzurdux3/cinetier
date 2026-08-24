import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { DropZone } from '@/ui/import/DropZone';

const imdbCsv = readFileSync('tests/fixtures/imdb-ratings.csv', 'utf8');

/**
 * The dashed panel itself, which is what carries the drag-and-drop handlers.
 * It has no role of its own to query by, and its visible text changes while an
 * import is in flight, so it is found by the aria-busy it always exposes.
 */
function zone(): HTMLElement {
  const panel = document.querySelector<HTMLElement>('[aria-busy]');
  if (panel === null) throw new Error('the drop panel is not in the document');
  return panel;
}

describe('DropZone', () => {
  it('imports a file dropped onto the panel, not only one chosen through the picker', async () => {
    const onImported = vi.fn();
    render(<DropZone onImported={onImported} />);

    // jsdom builds no DataTransfer for a synthetic drag event, so the files
    // come in as a stub — the only part of it the component reads.
    fireEvent.drop(zone(), {
      dataTransfer: { files: [new File([imdbCsv], 'ratings.csv', { type: 'text/csv' })] },
    });

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(onImported.mock.calls[0]![0]).toMatchObject({ status: 'ok' });
  });

  it('highlights while a file is over it and stops when the file leaves again', () => {
    render(<DropZone onImported={vi.fn()} />);

    expect(zone().className).not.toContain('border-accent');

    fireEvent.dragOver(zone());
    expect(zone().className).toContain('border-accent');

    fireEvent.dragLeave(zone());
    expect(zone().className).not.toContain('border-accent');
  });

  it('drops the highlight once the file has been dropped', async () => {
    render(<DropZone onImported={vi.fn()} />);

    fireEvent.dragOver(zone());
    expect(zone().className).toContain('border-accent');

    fireEvent.drop(zone(), {
      dataTransfer: { files: [new File([imdbCsv], 'ratings.csv', { type: 'text/csv' })] },
    });

    expect(zone().className).not.toContain('border-accent');
    await waitFor(() => expect(zone()).toHaveAttribute('aria-busy', 'false'));
  });

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

  it('clears the file input after reading, so the same file can be chosen again', async () => {
    render(<DropZone onImported={vi.fn()} />);
    const input: HTMLInputElement = screen.getByLabelText(/choose a file/i);

    await userEvent.upload(input, new File(['a,b\n1,2'], 'random.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // A file input holds on to its last selection, and re-choosing that same
    // file fires no change event at all — so after an error, the retry the user
    // is most likely to make would leave the page looking dead.
    expect(input.value).toBe('');
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
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');

    const input = screen.getByLabelText(/choose a file/i);
    fireEvent.change(input, {
      target: { files: [new File([imdbCsv], 'ratings.csv', { type: 'text/csv' })] },
    });

    expect(status).toHaveTextContent(/reading your export/i);
    await waitFor(() => expect(status.textContent).toBe(''));
  });
});
