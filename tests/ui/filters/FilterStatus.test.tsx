import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterStatus } from '@/ui/filters/FilterStatus';
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
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('1 of 3 titles');
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
});
