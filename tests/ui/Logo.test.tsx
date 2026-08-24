import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Logo } from '@/ui/Logo';
import { LOGO_SHAPES, FAVICON_COLOURS, logoSvgMarkup, type LogoRole } from '@/ui/logoMark';

describe('Logo renders the same shapes the favicon is generated from', () => {
  // The old parity test in logoMark.test.ts called logoSvgMarkup twice against
  // the same LOGO_SHAPES array — it proved logoSvgMarkup is deterministic, not
  // that Logo.tsx agrees with it. Logo.tsx maps LOGO_SHAPES to JSX independently
  // and never calls logoSvgMarkup at all, so the real invariant has to be
  // checked by rendering the component and comparing it against the data.

  it('renders exactly as many paths as LOGO_SHAPES has entries', () => {
    const { container } = render(<Logo />);
    expect(container.querySelectorAll('path').length).toBe(LOGO_SHAPES.length);
  });

  it('renders each path’s d attribute in the same order as LOGO_SHAPES', () => {
    // Order matters: the bars overlap in stacking, so swapping two changes
    // which one draws on top, not just which colour goes where.
    const { container } = render(<Logo />);
    const renderedDs = [...container.querySelectorAll('path')].map((path) =>
      path.getAttribute('d'),
    );
    expect(renderedDs).toEqual(LOGO_SHAPES.map((shape) => shape.d));
  });

  it('resolves each role to its theme variable, while the favicon resolves the same role to its literal', () => {
    const { container } = render(<Logo />);
    const renderedPaths = [...container.querySelectorAll('path')];
    const faviconMarkup = logoSvgMarkup((role: LogoRole) => FAVICON_COLOURS[role], 32);

    LOGO_SHAPES.forEach((shape, index) => {
      expect(renderedPaths[index]?.getAttribute('fill')).toBe(`var(--color-${shape.fill})`);
      expect(faviconMarkup).toContain(`fill='${FAVICON_COLOURS[shape.fill]}'`);
    });
  });
});
