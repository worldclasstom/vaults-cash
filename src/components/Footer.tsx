import Link from "next/link";

/** Shared footer content — AppShell wraps it in the narrow app column,
 *  the landing page in a wide marketing container. */
export function FooterContent() {
  return (
    <div className="space-y-3 text-xs text-muted/80">
      <p>
        <span className="text-muted">Self-custodial:</span> your funds stay in
        your own wallet and in positions you own — vaults.cash never takes
        custody. Positions sit in official Uniswap v4 pools on Base and
        Robinhood Chain.
      </p>
      <p>
        LP positions carry market &amp; impermanent-loss risk and are not
        insured. Flat {Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100}%
        conversion fee — no other charges.
      </p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
        <Link href="/how-it-works" className="text-muted underline-offset-2 hover:text-foreground hover:underline">
          How it works
        </Link>
        <Link href="/disclosures" className="text-muted underline-offset-2 hover:text-foreground hover:underline">
          Disclosures &amp; fees
        </Link>
        <Link href="/trust" className="text-muted underline-offset-2 hover:text-foreground hover:underline">
          Your money, your wallet
        </Link>
        <a
          href="https://base.blockscout.com"
          target="_blank"
          rel="noreferrer"
          className="text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Explorer
        </a>
        <span className="text-muted/60">© 2026 vaults.cash</span>
      </p>
    </div>
  );
}
