import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  RatingControls,
  EraControls,
  TypeControls,
  GenreControls,
  DirectorControls,
  RuntimeControls,
  WatchedControls,
  TopNControls,
} from '@/ui/filters/FilterControls';
import { makeFilm } from '../../support/film';

const library = [
  makeFilm({ title: 'Heat', year: 1995, titleType: 'movie' }),
  makeFilm({ title: 'Blade Runner', year: 1982, titleType: 'movie' }),
  makeFilm({ title: 'Breaking Bad', year: 2008, titleType: 'series' }),
];

describe('RatingControls', () => {
  it('sets a minimum', () => {
    const onChange = vi.fn();
    render(<RatingControls films={library} criteria={{}} onChange={onChange} />);

    // fireEvent, not userEvent.type: these inputs are controlled by a criteria
    // object the test never updates, so typing "80" would deliver "8" and then
    // "0" and the assertion would be about the last character rather than the
    // number. One change event carries the whole value.
    fireEvent.change(screen.getByLabelText('Minimum rating'), { target: { value: '80' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minRating: 80 }));
  });

  it('clears a bound when the box is emptied, rather than setting it to zero', async () => {
    // Number('') is 0, and a silent "rating 0 or more" is a filter nobody asked
    // for that quietly excludes every unrated title.
    const onChange = vi.fn();
    render(<RatingControls films={library} criteria={{ minRating: 80 }} onChange={onChange} />);

    await userEvent.clear(screen.getByLabelText('Minimum rating'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minRating: undefined }));
  });

  it('stores a below-the-public-score bound as a negative delta', () => {
    const onChange = vi.fn();
    render(<RatingControls films={library} criteria={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Below the public score by at least'), {
      target: { value: '10' },
    });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxRatingDelta: -10 }));
  });

  it('toggles unrated only', async () => {
    const onChange = vi.fn();
    render(<RatingControls films={library} criteria={{}} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Only unrated titles'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ onlyUnrated: true }));
  });
});

describe('EraControls', () => {
  it('offers only the decades the library holds', () => {
    render(<EraControls films={library} criteria={{}} onChange={vi.fn()} />);

    expect(screen.getByLabelText('1980s')).toBeInTheDocument();
    expect(screen.getByLabelText('1990s')).toBeInTheDocument();
    expect(screen.getByLabelText('2000s')).toBeInTheDocument();
    expect(screen.queryByLabelText('1970s')).not.toBeInTheDocument();
  });

  it('adds and removes a decade', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<EraControls films={library} criteria={{}} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('1990s'));
    expect(onChange).toHaveBeenLastCalledWith({ decades: [1990] });

    rerender(<EraControls films={library} criteria={{ decades: [1990] }} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('1990s'));
    expect(onChange).toHaveBeenLastCalledWith({ decades: [] });
  });
});

describe('TypeControls', () => {
  it('offers only the kinds of title present, named in the plural', () => {
    render(<TypeControls films={library} criteria={{}} onChange={vi.fn()} />);

    expect(screen.getByLabelText('films')).toBeInTheDocument();
    expect(screen.getByLabelText('series')).toBeInTheDocument();
    expect(screen.queryByLabelText('episodes')).not.toBeInTheDocument();
  });
});

const detailed = [
  makeFilm({ title: 'Heat', genres: ['Crime'], directors: ['Michael Mann'], runtimeMinutes: 170 }),
  makeFilm({
    title: 'Solaris',
    genres: ['Drama'],
    directors: ['Andrei Tarkovsky'],
    runtimeMinutes: 167,
  }),
];

describe('GenreControls', () => {
  it('offers only the genres the library holds', () => {
    render(<GenreControls films={detailed} criteria={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Crime')).toBeInTheDocument();
    expect(screen.queryByLabelText('Western')).not.toBeInTheDocument();
  });
});

describe('DirectorControls', () => {
  const many = Array.from({ length: 60 }, (_, index) =>
    makeFilm({ title: `Film ${index}`, directors: [`Director ${String(index).padStart(2, '0')}`] }),
  );

  it('narrows the list as you search', async () => {
    render(<DirectorControls films={detailed} criteria={{}} onChange={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Search directors'), 'tark');

    expect(screen.getByLabelText('Andrei Tarkovsky')).toBeInTheDocument();
    expect(screen.queryByLabelText('Michael Mann')).not.toBeInTheDocument();
  });

  it('says how many names it is not showing, rather than truncating in silence', () => {
    render(<DirectorControls films={many} criteria={{}} onChange={vi.fn()} />);
    expect(screen.getByText(/Showing 50 of 60/)).toBeInTheDocument();
  });

  it('keeps a chosen director on screen even when the search would hide them', async () => {
    // Otherwise a filter can be set and then become impossible to unset from
    // the control that set it.
    render(
      <DirectorControls
        films={detailed}
        criteria={{ directors: ['Michael Mann'] }}
        onChange={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText('Search directors'), 'tark');

    expect(screen.getByLabelText('Michael Mann')).toBeChecked();
  });
});

describe('RuntimeControls', () => {
  it('says what the library spans, so the bounds mean something', () => {
    render(<RuntimeControls films={detailed} criteria={{}} onChange={vi.fn()} />);
    expect(screen.getByText(/167 to 170 minutes/)).toBeInTheDocument();
  });

  it('sets a minimum', () => {
    const onChange = vi.fn();
    render(<RuntimeControls films={detailed} criteria={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Shortest'), { target: { value: '90' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minRuntimeMinutes: 90 }));
  });
});

describe('WatchedControls', () => {
  it('sets a date at local midnight, not the previous evening', () => {
    // new Date('2024-01-31') is UTC midnight, which is 31 January only for
    // readers east of Greenwich.
    const onChange = vi.fn();
    render(<WatchedControls films={detailed} criteria={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Watched after'), { target: { value: '2024-01-31' } });

    const [[next]] = onChange.mock.calls.slice(-1) as [[{ watchedAfter: Date }]];
    expect(next.watchedAfter.getFullYear()).toBe(2024);
    expect(next.watchedAfter.getMonth()).toBe(0);
    expect(next.watchedAfter.getDate()).toBe(31);
  });

  it('toggles rewatches only', async () => {
    const onChange = vi.fn();
    render(<WatchedControls films={detailed} criteria={{}} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Only rewatches'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ onlyRewatches: true }));
  });
});

describe('TopNControls', () => {
  it('keeps only the highest rated N', () => {
    const onChange = vi.fn();
    render(<TopNControls films={detailed} criteria={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Keep the top'), { target: { value: '25' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ topN: 25 }));
  });
});
