/**
 * Placeholder recreation of the vaults.cash mark (stacked cash, tilted).
 * Swap for the real asset by dropping it at public/logo.png and updating
 * the header — kept as inline SVG so it works in emails/OG too.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <g transform="rotate(-8 32 32)">
        <path
          d="M10 46c14 5 30 5 44 0v5c-14 5-30 5-44 0v-5Z"
          fill="#3e8f2b"
          opacity={0.55}
        />
        <path
          d="M10 38c14 5 30 5 44 0v5c-14 5-30 5-44 0v-5Z"
          fill="#54ad35"
          opacity={0.8}
        />
        <rect x="10" y="14" width="44" height="18" rx="4" fill="#7cd44a" />
        <rect x="16" y="18" width="32" height="10" rx="2" fill="#2f7a1e" />
        <rect x="27" y="19.5" width="10" height="7" rx="3" fill="#7cd44a" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <LogoMark />
      <span className="text-lg">
        vaults<span className="text-accent">.cash</span>
      </span>
    </span>
  );
}
