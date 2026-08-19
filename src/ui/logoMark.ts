/**
 * The Cinetier mark, held as data so that exactly one description of it exists.
 *
 * Three slanted bars of decreasing width: a tier list and a strip of film at
 * once. The shape carries the meaning, not the shading — the previous mark put
 * its meaning in two greys and 2px stripes, and it failed at favicon size and
 * vanished entirely under an extension that repaints fills.
 *
 * Colour is passed in rather than baked in: the component resolves each role to
 * a CSS variable so the mark follows the theme, while the favicon generator
 * resolves it to a literal, because a data URI cannot read a variable.
 */
export type LogoRole = 'tier-s' | 'tier-b' | 'tier-d';

export interface LogoShape {
  readonly d: string;
  readonly fill: LogoRole;
}

export const LOGO_VIEW_BOX = '0 0 32 32';

export const LOGO_SHAPES: readonly LogoShape[] = [
  { d: 'M2 5 L30 3 L30 11 L2 13 Z', fill: 'tier-s' },
  { d: 'M2 14.5 L23 13 L23 21 L2 22.5 Z', fill: 'tier-b' },
  { d: 'M2 24 L16 23 L16 31 L2 32 Z', fill: 'tier-d' },
];

/**
 * The literal colours the favicon uses — the default theme's tier values.
 * This file is the one place in src/ui allowed a colour literal, and the lint
 * configuration exempts it by name for exactly this reason.
 */
export const FAVICON_COLOURS: Record<LogoRole, string> = {
  'tier-s': '#e24b4b',
  'tier-b': '#e8b44a',
  'tier-d': '#4fa3d1',
};

export function logoSvgMarkup(colour: (role: LogoRole) => string, size: number): string {
  const paths = LOGO_SHAPES.map(
    (shape) => `<path d='${shape.d}' fill='${colour(shape.fill)}'/>`,
  ).join('');

  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${LOGO_VIEW_BOX}' width='${size}' height='${size}'>${paths}</svg>`;
}
