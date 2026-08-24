import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Shell } from '@/ui/Shell';

describe('Shell', () => {
  it('names the product and renders its children', () => {
    render(
      <Shell>
        <p>content</p>
      </Shell>,
    );
    expect(screen.getByRole('banner')).toHaveTextContent('Cinetier');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('carries the attribution TMDB requires', () => {
    render(
      <Shell>
        <p>content</p>
      </Shell>,
    );
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      /uses the TMDB API but is not endorsed or certified by TMDB/i,
    );
  });

  it('states that nothing leaves the browser', () => {
    render(
      <Shell>
        <p>content</p>
      </Shell>,
    );
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/never leave your browser/i);
  });

  it('renders the page texture exactly once', () => {
    const { container } = render(
      <Shell>
        <p>content</p>
      </Shell>,
    );
    expect(container.querySelectorAll('[data-texture]').length).toBe(1);
  });

  it('paints the texture before the content, not after it', () => {
    const { container } = render(
      <Shell>
        <p>content</p>
      </Shell>,
    );
    const outer = container.firstElementChild;
    expect(outer?.firstElementChild).toHaveAttribute('data-texture');
  });

  it('lifts the header, main and footer above the texture', () => {
    render(
      <Shell>
        <p>content</p>
      </Shell>,
    );
    expect(screen.getByRole('banner')).toHaveClass('z-10');
    expect(screen.getByRole('main')).toHaveClass('z-10');
    expect(screen.getByRole('contentinfo')).toHaveClass('z-10');
  });
});
