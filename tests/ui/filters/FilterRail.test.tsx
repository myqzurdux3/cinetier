import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterRail } from '@/ui/filters/FilterRail';
import { makeFilm } from '../../support/film';

const library = [
  makeFilm({ title: 'Heat', year: 1995, rating: 90, genres: ['Crime'] }),
  makeFilm({ title: 'Blade Runner', year: 1982, rating: 70, genres: ['Science fiction'] }),
  makeFilm({ title: 'Breaking Bad', year: 2008, rating: 95, titleType: 'series' }),
];

/**
 * The section's summary heading, disambiguated from the fieldset's own
 * sr-only <legend> — FilterSection renders the title in both places, so a
 * bare getByText(title) matches two elements.
 */
function summaryHeading(title: string): HTMLElement {
  return screen.getByText(title, { selector: 'summary > span' });
}

/**
 * The section's fieldset, found through its summary.
 *
 * Not getByRole('group'): five of the eight sections start closed, and content
 * inside a closed <details> is out of the accessibility tree, so a role query
 * would find nothing and the test would fail for a reason that has nothing to
 * do with disabling.
 */
function fieldsetOf(title: string): HTMLFieldSetElement {
  return summaryHeading(title).closest('details')!.querySelector('fieldset')!;
}

describe('FilterRail', () => {
  it('shows all eight sections', () => {
    render(<FilterRail films={library} criteria={{}} onChange={vi.fn()} fetchingDetails={null} />);

    for (const title of [
      'Rating',
      'Era',
      'Type',
      'Genre',
      'Director',
      'Runtime',
      'Watched',
      'Top N',
    ]) {
      expect(summaryHeading(title)).toBeInTheDocument();
    }
  });

  it('opens the first three and leaves the rest closed', () => {
    const { container } = render(
      <FilterRail films={library} criteria={{}} onChange={vi.fn()} fetchingDetails={null} />,
    );
    const open = [...container.querySelectorAll('details')].map((element) =>
      element.hasAttribute('open'),
    );
    expect(open).toEqual([true, true, true, false, false, false, false, false]);
  });

  it('counts each section by its own criteria alone, not by all of them', () => {
    // minRating 90 admits two; the Era section is told about 1990s only, which
    // admits one. If a section counted the whole criteria object, both headers
    // would read the same number and neither would say which one cut what.
    render(
      <FilterRail
        films={library}
        criteria={{ minRating: 90, decades: [1990] }}
        onChange={vi.fn()}
        fetchingDetails={null}
      />,
    );

    expect(summaryHeading('Rating').closest('summary')).toHaveTextContent('2 / 3');
    expect(summaryHeading('Era').closest('summary')).toHaveTextContent('1 / 3');
  });

  it('disables the metadata sections while the details pass is still running', () => {
    render(
      <FilterRail
        films={library}
        criteria={{}}
        onChange={vi.fn()}
        fetchingDetails={{ done: 40, total: 120 }}
      />,
    );

    // Only those three: nothing about the rating or the year needs TMDB.
    const notes = screen.getAllByText('Looking up genres and directors… 80 to go');
    expect(notes).toHaveLength(3);
    expect(fieldsetOf('Genre')).toBeDisabled();
    expect(fieldsetOf('Rating')).not.toBeDisabled();
  });

  it('enables the metadata sections once the pass has finished', () => {
    render(<FilterRail films={library} criteria={{}} onChange={vi.fn()} fetchingDetails={null} />);
    expect(fieldsetOf('Genre')).not.toBeDisabled();
  });
});
