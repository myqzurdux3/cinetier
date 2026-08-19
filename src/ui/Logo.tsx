import { LOGO_SHAPES, LOGO_VIEW_BOX } from './logoMark';

interface LogoProps {
  size?: number;
}

/** The mark, following the active theme through its tier tokens. */
export function Logo({ size = 28 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox={LOGO_VIEW_BOX} role="img" aria-label="Cinetier">
      {LOGO_SHAPES.map((shape) => (
        <path key={shape.d} d={shape.d} fill={`var(--color-${shape.fill})`} />
      ))}
    </svg>
  );
}
