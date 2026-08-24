import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { TierRow, tierColorVar } from '@/ui/board/TierRow';
import { DEFAULT_TIERS } from '@/domain/tiers';
import { makeFilm } from '../../support/film';

const tier = DEFAULT_TIERS[0]!;
const films = [makeFilm({ title: 'Heat' }), makeFilm({ title: 'Dune' })];

function renderRow(props: Partial<Parameters<typeof TierRow>[0]> = {}) {
  return render(
    <DndContext>
      <TierRow tier={tier} films={films} {...props} />
    </DndContext>,
  );
}

describe('tierColorVar', () => {
  it('turns a token name into that token, and nothing else', () => {
    // The one place src/ui/** is allowed near a colour: a template over the
    // six known names. A regression to a literal would break the lint rule
    // this project enforces on the whole directory.
    expect(tierColorVar('s')).toBe('var(--color-tier-s)');
    expect(tierColorVar('f')).toBe('var(--color-tier-f)');
  });
});

describe('TierRow', () => {
  it('is a labelled region carrying the row name', () => {
    renderRow();
    expect(screen.getByRole('list', { name: /^S\b/ })).toBeInTheDocument();
  });

  it('renders one card per film, in the order given', () => {
    renderRow();
    const titles = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(titles).toEqual(['Heat', 'Dune']);
  });

  it('says a row is empty rather than showing nothing at all', () => {
    // An empty row that renders as a bare strip gives no drop affordance and
    // no explanation; a screen-reader user meets a list with no items and no
    // reason why.
    renderRow({ films: [] });
    expect(screen.getByText(/drop films here/i)).toBeInTheDocument();
  });

  it('announces how many films the row holds', () => {
    renderRow();
    expect(screen.getByRole('list', { name: /2 films/ })).toBeInTheDocument();
  });
});
