import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";

export const metadata = { title: "How it works — vaults.cash" };

const FEE_PCT = Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-sm font-bold text-accent">
        {n}
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="pt-1 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl animate-rise space-y-8 px-6 py-14">
        <header>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">How it works</h1>
          <p className="pt-2 text-muted">
            No black box: here is exactly what happens to your money, step by
            step — and how to verify every part of it yourself, on-chain.
          </p>
        </header>

        <section className="rounded-3xl bg-surface shadow-card p-6">
          <h2 className="pb-4 text-lg font-semibold">
            When you deposit — say, $100 into the ETH market
          </h2>
          <ol className="space-y-5">
            <Step n={1} title="Your USDC is split for the pool">
              A liquidity position holds two assets. We compute the exact split
              your chosen price range needs right now (for example ~$49.70 of
              ETH and ~$49.70 of USDC), and swap that share on Uniswap with a
              slippage bound — if the market moves too much mid-transaction,
              everything reverts and you keep your money.
            </Step>
            <Step n={2} title="Your position is created — owned by you">
              The two halves go into the official Uniswap v4 pool, and the
              position comes back to your wallet as an NFT. It is yours the
              same way the USDC was: vaults.cash has no key, no admin switch,
              and no way to touch it.
            </Step>
            <Step n={3} title={`Our fee comes last: ${FEE_PCT}% flat`}>
              The final call in the batch sends {FEE_PCT}% of your deposit
              (60¢ on $100) to vaults.cash. It is a plain, visible transfer on
              the public ledger — and because it runs last, a failed or
              abandoned deposit costs you nothing.
            </Step>
            <Step n={4} title="All of it happens as ONE transaction">
              Every step above is batched atomically: it all succeeds, or it
              all reverts as if nothing happened. There is no state where your
              cash is swapped but stuck.
            </Step>
          </ol>
        </section>

        <section className="rounded-3xl bg-surface shadow-card p-6">
          <h2 className="pb-2 text-lg font-semibold">How you earn</h2>
          <p className="text-sm leading-relaxed text-muted">
            Every trade in your pool pays a fee to its liquidity providers —
            you earn your share while the market price stays inside your
            position&apos;s range. Earned fees accumulate to your position and
            show on your portfolio; collect them anytime. Estimated APRs are
            based on recent pool activity and are not promises.
          </p>
        </section>

        <section className="rounded-3xl bg-surface shadow-card p-6">
          <h2 className="pb-2 text-lg font-semibold">When you withdraw</h2>
          <p className="text-sm leading-relaxed text-muted">
            The position is burned, both halves come back, and the non-USDC
            half is swapped to USDC — landing in your wallet as cash. The same
            flat {FEE_PCT}% applies to the amount converted on the way out.
            You can also send funds anywhere on Base (including
            back to an exchange) from your dashboard.
          </p>
        </section>

        <section className="rounded-3xl bg-surface shadow-card p-6">
          <h2 className="pb-3 text-lg font-semibold">The honest risk list</h2>
          <ul className="space-y-3 text-sm leading-relaxed text-muted">
            <li>
              <span className="font-semibold text-foreground">Prices move.</span>{" "}
              A position&apos;s value tracks the assets in it. Concentrated
              ranges can underperform simply holding (&quot;impermanent
              loss&quot;) when prices trend hard in one direction.
            </li>
            <li>
              <span className="font-semibold text-foreground">Ranges end.</span>{" "}
              If price leaves your range, your position stops earning until it
              returns (or you reposition). &quot;Set &amp; forget&quot; never
              goes out of range but earns a lower rate.
            </li>
            <li>
              <span className="font-semibold text-foreground">Contracts are code.</span>{" "}
              Your funds sit in Uniswap v4 — among the most audited contracts
              in crypto — but no smart contract is risk-free. vaults.cash adds
              no contract of its own to that path.
            </li>
            <li>
              <span className="font-semibold text-foreground">This chain is new.</span>{" "}
              Base launched July 2026; some pools are still thin.
              Thin pools mean bigger price impact — we warn you before any
              deposit where this bites.
            </li>
          </ul>
        </section>

        <section className="rounded-3xl bg-surface shadow-card p-6">
          <h2 className="pb-2 text-lg font-semibold">Don&apos;t trust — verify</h2>
          <p className="text-sm leading-relaxed text-muted">
            Every claim above is checkable. Your wallet, your positions, our
            fee address, every transaction: all public on{" "}
            <a
              href="https://base.blockscout.com"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              the Base explorer
            </a>
            . Full fee schedule and legal detail on the{" "}
            <Link href="/disclosures" className="text-accent underline-offset-2 hover:underline">
              disclosures page
            </Link>
            .
          </p>
        </section>

        <div className="pb-4 text-center">
          <Link
            href="/"
            className="inline-block rounded-full bg-accent px-8 py-3 font-semibold text-black transition-colors hover:bg-accent-strong"
          >
            Explore markets
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
