interface LogoProps {
  size?: number;
}

/**
 * The Cinetier mark: a clapperboard whose stripes are the tier colors.
 * Inline SVG rather than a file so it inherits currentColor and needs no request.
 */
export function Logo({ size = 28 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Cinetier"
      fill="none"
    >
      <rect x="2" y="11" width="28" height="19" rx="3" fill="var(--color-surface)" />
      <g>
        <path d="M2 4.5 L30 2 L30 10 L2 12.5 Z" fill="#1c1c20" />
        <path d="M5 4.2 L9 3.8 L6.5 11.6 L2.5 12 Z" fill="var(--color-tier-s)" />
        <path d="M12 3.6 L16 3.2 L13.5 11 L9.5 11.4 Z" fill="var(--color-tier-a)" />
        <path d="M19 3 L23 2.6 L20.5 10.4 L16.5 10.8 Z" fill="var(--color-tier-b)" />
        <path d="M26 2.4 L30 2 L30 9.6 L23.5 10.2 Z" fill="var(--color-tier-c)" />
      </g>
      <rect x="7" y="16" width="18" height="2.5" rx="1.25" fill="var(--color-tier-s)" />
      <rect x="7" y="21" width="13" height="2.5" rx="1.25" fill="var(--color-tier-b)" />
      <rect x="7" y="26" width="8" height="2.5" rx="1.25" fill="var(--color-tier-d)" />
    </svg>
  );
}
