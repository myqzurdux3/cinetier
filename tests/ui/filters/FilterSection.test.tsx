import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterSection } from '@/ui/filters/FilterSection';

describe('FilterSection', () => {
  it('shows how many titles its own criteria admit', () => {
    render(
      <FilterSection title="Rating" count={143} total={400}>
        <p>controls</p>
      </FilterSection>,
    );
    expect(screen.getByText('143 / 400')).toBeInTheDocument();
  });

  it('shows the plain total when the section admits everything', () => {
    render(
      <FilterSection title="Rating" count={400} total={400}>
        <p>controls</p>
      </FilterSection>,
    );
    expect(screen.getByText('400')).toBeInTheDocument();
  });

  it('is a real disclosure, open or closed by request', () => {
    // A div that only looks clickable is unreachable by keyboard and invisible
    // to a screen reader. <details> is neither.
    const { container } = render(
      <FilterSection title="Rating" count={1} total={1} defaultOpen>
        <p>controls</p>
      </FilterSection>,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details).toHaveAttribute('open');
    expect(container.querySelector('summary')).toHaveTextContent('Rating');
  });

  it('replaces its controls with the reason when it cannot be used yet', () => {
    render(
      <FilterSection
        title="Genre"
        count={0}
        total={0}
        disabled
        disabledNote="Still loading 120 titles"
      >
        <p>controls</p>
      </FilterSection>,
    );
    expect(screen.getByText('Still loading 120 titles')).toBeInTheDocument();
    expect(screen.queryByText('controls')).not.toBeInTheDocument();
  });

  it('names its own group for a screen reader', () => {
    render(
      <FilterSection title="Rating" count={1} total={1} defaultOpen>
        <p>controls</p>
      </FilterSection>,
    );
    expect(screen.getByRole('group', { name: 'Rating' })).toBeInTheDocument();
  });
});
