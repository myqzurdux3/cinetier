import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageTexture } from '@/ui/PageTexture';

describe('PageTexture', () => {
  it('is decorative, so assistive technology never announces it', () => {
    const { container } = render(<PageTexture />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('never intercepts a click meant for the page beneath it', () => {
    const { container } = render(<PageTexture />);
    // A full-viewport fixed overlay that takes pointer events makes the whole
    // interface unclickable, and it does so silently.
    expect(container.firstElementChild).toHaveClass('pointer-events-none');
  });

  it('is one element for the whole page, not one per anything', () => {
    const { container } = render(<PageTexture />);
    expect(container.querySelectorAll('div[aria-hidden="true"]').length).toBe(1);
  });

  it('gives the vignette its own full-strength layer, separate from the faint grain', () => {
    // The grain and the vignette used to be two background images on the same
    // element, so the grain's low opacity multiplied into the vignette too and
    // left it at roughly 0.003-0.005 effective alpha — invisible. Pinning two
    // distinct children, one full-strength and one dimmed, means that
    // regression can't come back silently.
    const { container } = render(<PageTexture />);
    const layers = Array.from(container.firstElementChild!.children) as HTMLElement[];
    expect(layers).toHaveLength(2);

    const vignetteLayer = layers.find((el) => el.style.backgroundImage === 'var(--vignette)');
    expect(vignetteLayer).toBeDefined();
    expect(vignetteLayer!.style.opacity).toBe('');

    const grainLayer = layers.find((el) => el.style.backgroundImage === 'var(--texture-image)');
    expect(grainLayer).toBeDefined();
    expect(grainLayer!.style.opacity).toBe('var(--texture-opacity)');
  });
});
