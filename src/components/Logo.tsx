import Image from "next/image";

/** The real brand mark (same asset the Privy modal uses). */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/vaults-mark.png"
      alt=""
      width={size}
      height={size}
      className="rounded-lg"
      priority
    />
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
