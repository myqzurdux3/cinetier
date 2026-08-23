import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoResults } from '@/ui/filters/NoResults';
import { FilterStatus, FILTER_STATUS_ID } from '@/ui/filters/FilterStatus';
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
    // Exact text, not a substring match: the button below now also reads
    // "Remove Rating 99 or more" (Label in Name, WCAG 2.5.3), so a loose
    // /Rating 99 or more/ match is ambiguous between the two elements.
    expect(screen.getByText('Rating 99 or more is cutting the most.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Rating 99 or more' }));
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
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
  });

  it('always offers to clear everything', async () => {
    const onChange = vi.fn();
    render(<NoResults films={library} criteria={{ minRating: 99 }} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  // NoResults's own culprit-removal button unmounts along with the criterion
  // it names, usually taking NoResults itself with it as soon as results stop
  // being zero — so, unlike FilterStatus, it cannot refocus something inside
  // itself. FilterStatus's wrapper is mounted alongside it in the real app
  // (App.tsx renders both together, exactly as here) and never unmounts
  // across this transition, which is what makes it the sensible shared
  // target for both components' removal paths.
  it('moves focus to the always-mounted filter status region, not <body>, when the culprit is removed', async () => {
    const criteria = { minRating: 99, genres: ['Science fiction'] };
    render(
      <>
        <FilterStatus
          films={library}
          visible={[]}
          criteria={criteria}
          onChange={vi.fn()}
          showClearAll={false}
        />
        <NoResults films={library} criteria={criteria} onChange={vi.fn()} />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove Rating 99 or more' }));

    expect(document.activeElement).toBe(document.getElementById(FILTER_STATUS_ID));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('moves focus to the always-mounted filter status region, not <body>, when clear-all is used', async () => {
    const criteria = { minRating: 99 };
    render(
      <>
        <FilterStatus
          films={library}
          visible={[]}
          criteria={criteria}
          onChange={vi.fn()}
          showClearAll={false}
        />
        <NoResults films={library} criteria={criteria} onChange={vi.fn()} />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(document.activeElement).toBe(document.getElementById(FILTER_STATUS_ID));
    expect(document.activeElement).not.toBe(document.body);
  });
});
