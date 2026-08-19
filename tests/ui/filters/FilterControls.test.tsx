import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RatingControls, EraControls, TypeControls } from '@/ui/filters/FilterControls';
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
