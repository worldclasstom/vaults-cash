import { MarketingShell } from "@/components/MarketingShell";

export const metadata = { title: "Disclosures — vaults.cash" };

export default function DisclosuresPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl animate-rise px-6 py-14">
        <h1 className="pb-6 text-3xl font-bold">Disclosures</h1>
        <div className="space-y-6 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="pb-1 font-semibold text-foreground">What vaults.cash is</h2>
            <p>
              vaults.cash is a self-custodial interface for providing liquidity to
              Uniswap pools on Base. Your funds sit in your own wallet
              and in pool positions you own — vaults.cash never takes custody.
              vaults.cash is not affiliated with, endorsed by, or sponsored by
              Coinbase, Uniswap Labs, or Circle. Every market is crypto — we do
              not offer tokenized stocks or any security.
            </p>
          </section>
          <section>
            <h2 className="pb-1 font-semibold text-foreground">Fees</h2>
            <p>
              vaults.cash charges {Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100}% of
              the amount converted when you enter or exit a position. Pool trading
              fees you earn are yours entirely. Network (gas) fees — typically
              under $0.02 per action — are paid from your wallet directly to the
              blockchain; vaults.cash does not mark them up or profit from them.
            </p>
          </section>
          <section>
            <h2 className="pb-1 font-semibold text-foreground">Risks</h2>
            <p>
              Liquidity positions are not deposits and are not insured. The value
              of a position changes with the price of the assets in it, and
              concentrated positions can underperform simply holding the assets
              (&quot;impermanent loss&quot;). Positions can go out of range and stop
              earning. Smart contracts can have bugs. Never deposit more than you
              can afford to lose.
            </p>
          </section>
          <section>
            <h2 className="pb-1 font-semibold text-foreground">Stablecoin pairs</h2>
            <p>
              Markets marked &quot;Stablecoin&quot; pair USDC against another
              dollar-denominated token. Because both sides track the dollar,
              impermanent loss is typically minimal — but it is not zero:
              stablecoins can and do de-peg, and a de-peg is realized as a loss
              in the position. Stablecoins are not bank deposits and are not
              FDIC-insured.
            </p>
          </section>
          <section>
            <h2 className="pb-1 font-semibold text-foreground">No advice</h2>
            <p>
              Nothing here is investment, legal, or tax advice. Estimated APRs are
              extrapolations of recent pool activity and are not promises of
              future returns.
            </p>
          </section>
        </div>
      </div>
    </MarketingShell>
  );
}
