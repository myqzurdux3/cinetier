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
});
