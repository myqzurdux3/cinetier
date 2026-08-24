import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterRail, SECTIONS } from '@/ui/filters/FilterRail';
import { CRITERION_ORDER } from '@/domain/filters';
import { makeFilm } from '../../support/film';

const library = [
  makeFilm({ title: 'Heat', year: 1995, rating: 90, genres: ['Crime'] }),
  makeFilm({ title: 'Blade Runner', year: 1982, rating: 70, genres: ['Science fiction'] }),
  makeFilm({ title: 'Breaking Bad', year: 2008, rating: 95, titleType: 'series' }),
  // Casino passes the Era criterion below but not the Rating one; Whiplash the
  // reverse. Without a film on each side, a section that wrongly absorbed the
  // other's key could land on the correct count by coincidence — as Heat
  // alone did, since it passes both criteria at once.
  makeFilm({ title: 'Casino', year: 1995, rating: 60 }),
  makeFilm({ title: 'Whiplash', year: 2014, rating: 91 }),
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
    // minRating 90 admits three (Heat, Breaking Bad, Whiplash); decades [1990]
    // admits two (Heat, Casino). Combining both admits one (Heat only). If
    // either section counted the whole criteria object instead of its own
    // share, its header would read 1 / 5 instead of its real count.
    render(
      <FilterRail
        films={library}
        criteria={{ minRating: 90, decades: [1990] }}
        onChange={vi.fn()}
        fetchingDetails={null}
      />,
    );

    expect(summaryHeading('Rating').closest('summary')).toHaveTextContent('3 / 5');
    expect(summaryHeading('Era').closest('summary')).toHaveTextContent('2 / 5');
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

    // Only those three: nothing about the rating or the year needs TMDB. Named
    // individually, not just counted — a count of 3 alone would stay green if
    // the wrong section (e.g. Watched instead of Runtime) were disabled.
    const notes = screen.getAllByText('Looking up genres and directors… 80 to go');
    expect(notes).toHaveLength(3);
    expect(fieldsetOf('Genre')).toBeDisabled();
    expect(fieldsetOf('Director')).toBeDisabled();
    expect(fieldsetOf('Runtime')).toBeDisabled();
    expect(fieldsetOf('Rating')).not.toBeDisabled();
  });

  it('enables the metadata sections once the pass has finished', () => {
    render(<FilterRail films={library} criteria={{}} onChange={vi.fn()} fetchingDetails={null} />);
    expect(fieldsetOf('Genre')).not.toBeDisabled();
  });

  it('gives every criterion exactly one section', () => {
    // CRITERION_ORDER is not just "another hand list to diff against": it is
    // itself wrapped in `exhaustive` at its declaration in domain/filters.ts,
    // so TypeScript refuses to build if it ever drops a key of FilterCriteria.
    // That makes it a build-time-guaranteed stand-in for CriterionKey itself,
    // not a second copy that could drift the same way SECTIONS could. This
    // test only has to check SECTIONS against that guaranteed list — no key
    // list is hand-maintained here, so a criterion added to both
    // FilterCriteria and some section's `keys` never requires touching this
    // test.
    const sectionKeys = SECTIONS.flatMap((section) => section.keys);

    expect(new Set(sectionKeys).size).toBe(sectionKeys.length); // no duplicates
    expect([...sectionKeys].sort()).toEqual([...CRITERION_ORDER].sort()); // same membership
  });
});
