import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterStatus, FILTER_STATUS_ID } from '@/ui/filters/FilterStatus';
import { makeFilm } from '../../support/film';

const library = [
  makeFilm({ title: 'Heat', rating: 90 }),
  makeFilm({ title: 'Blade Runner', rating: 70 }),
  makeFilm({ title: 'Solaris', rating: 60 }),
];

describe('FilterStatus', () => {
  it('says how many titles are showing, of how many', () => {
    render(
      <FilterStatus
        films={library}
        visible={library.slice(0, 1)}
        criteria={{ minRating: 80 }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('1 of 3 titles')).toBeInTheDocument();
  });

  it('announces the count politely, from a region that is always mounted', () => {
    // A live region mounted only when something changes is frequently missed by
    // screen readers — the mistake this project already fixed once in DropZone.
    const { container, rerender } = render(
      <FilterStatus films={library} visible={library} criteria={{}} onChange={vi.fn()} />,
    );
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).toHaveTextContent('3 of 3 titles');

    rerender(
      <FilterStatus
        films={library}
        visible={library.slice(0, 1)}
        criteria={{ minRating: 80 }}
        onChange={vi.fn()}
      />,
    );
    // Reuse the node captured above, not a fresh query: identity is part of the
    // contract, since a region that unmounts and remounts announces nothing to
    // a screen reader even though a fresh querySelector would still find one.
    expect(region).toHaveTextContent('1 of 3 titles');
  });

  it('shows one chip per active criterion, and none when nothing is set', () => {
    const { rerender } = render(
      <FilterStatus films={library} visible={library} criteria={{}} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();

    rerender(
      <FilterStatus
        films={library}
        visible={library}
        criteria={{ minRating: 80, genres: ['Crime'] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button', { name: /Remove filter/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();
  });

  it('removes exactly the criterion its chip names, and no other', async () => {
    const onChange = vi.fn();
    render(
      <FilterStatus
        films={library}
        visible={library}
        criteria={{ minRating: 80, genres: ['Crime'], topN: 10 }}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Genre: Crime' }));

    expect(onChange).toHaveBeenCalledWith({ minRating: 80, topN: 10 });
  });

  it('clears everything at once', async () => {
    const onChange = vi.fn();
    render(
      <FilterStatus
        films={library}
        visible={library}
        criteria={{ minRating: 80 }}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(onChange).toHaveBeenCalledWith({});
  });

  it('moves focus to its own wrapper, not <body>, when a chip removes itself', async () => {
    // The button the user just activated unmounts along with the criterion it
    // named. Left alone, focus falls to <body> — the rail's most common
    // interaction, for a keyboard user. FilterStatus's own wrapper is always
    // mounted (see the always-mounted comment on the live region above), so
    // it is a stable, sensible landing spot.
    render(
      <FilterStatus
        films={library}
        visible={library}
        criteria={{ minRating: 80, genres: ['Crime'] }}
        onChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Genre: Crime' }));

    expect(document.activeElement).toBe(document.getElementById(FILTER_STATUS_ID));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('moves focus to its own wrapper, not <body>, when clear-all removes itself', async () => {
    render(
      <FilterStatus
        films={library}
        visible={library}
        criteria={{ minRating: 80 }}
        onChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(document.activeElement).toBe(document.getElementById(FILTER_STATUS_ID));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('suppresses its own clear-all button when told to, even with active criteria', () => {
    // A caller (App) shows this alongside NoResults, which offers an
    // equivalent "Clear all filters" button of its own while results are
    // zero — the two must never coexist under the same accessible name.
    render(
      <FilterStatus
        films={library}
        visible={[]}
        criteria={{ minRating: 80 }}
        onChange={vi.fn()}
        showClearAll={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
    // The rest of the status bar — count and chips — still appears; only the
    // clear-all button is suppressed.
    expect(screen.getByText('0 of 3 titles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove filter/ })).toBeInTheDocument();
  });
});
