import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoResults } from '@/ui/filters/NoResults';
import { makeFilm } from '../../support/film';

const library = [
  makeFilm({ title: 'Heat', rating: 95, genres: ['Crime'] }),
  makeFilm({ title: 'Blade Runner', rating: 40, genres: ['Science fiction'] }),
  makeFilm({ title: 'Solaris', rating: 30, genres: ['Science fiction'] }),
];

describe('NoResults', () => {
  it('names the criterion that is cutting the most, and offers to drop it', async () => {
    const onChange = vi.fn();
    render(
      <NoResults
        films={library}
        criteria={{ minRating: 99, genres: ['Science fiction'] }}
        onChange={onChange}
      />,
    );

    // Dropping the rating bound admits two films; dropping the genre admits none.
    expect(screen.getByText(/Rating 99 or more/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Rating 99 or more' }));
    expect(onChange).toHaveBeenCalledWith({ genres: ['Science fiction'] });
  });

  it('says so plainly when no single filter is to blame', () => {
    render(
      <NoResults
        films={library}
        criteria={{ minRating: 99, genres: ['Western'] }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/several are combining/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
  });

  it('always offers to clear everything', async () => {
    const onChange = vi.fn();
    render(<NoResults films={library} criteria={{ minRating: 99 }} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onChange).toHaveBeenCalledWith({});
  });
});
