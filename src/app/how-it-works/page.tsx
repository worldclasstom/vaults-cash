import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { Chip } from "@/components/TokenIcon";
import { DepositFlow, RangeDemo, WithdrawFlow } from "@/components/HowItWorksVisuals";
import { CHAINS, CHAIN_IDS } from "@/lib/chain";

export const metadata = { title: "How it works — vaults.cash" };

const FEE_PCT = Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="sticker flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm text-black">{n}</span>
      <div>
        <p className="font-display text-lg font-extrabold leading-tight">{title}</p>
        <p className="pt-1.5 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}

function Section({ title, sticker, children }: { title: string; sticker?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="tilt rounded-3xl bg-surface p-6 shadow-card sm:p-7">
      <div className="flex flex-wrap items-center gap-3 pb-5">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
        {sticker}
      </div>
      {children}
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl animate-rise space-y-8 px-4 py-14 sm:px-6">
        <header className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Chip tone="accent">No black box</Chip>
            <Chip>Every step on-chain</Chip>
            <Chip tone="outline">Base + Robinhood Chain</Chip>
          </div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">How it works</h1>
          <p className="max-w-xl text-lg text-muted">
            Here is exactly what happens to your money, step by step, drawn with real numbers, and how to check every part of
            it yourself.
          </p>
        </header>

        <Section title="When you deposit" sticker={<Chip>say, $100 into ETH / USDC</Chip>}>
          <DepositFlow />
          <ol className="space-y-5 pt-6">
            <Step n={1} title="Your dollars are split for the pool">
              A liquidity position holds two assets. We compute the exact split your price range needs right now and swap
              that share on Uniswap with a slippage bound. If the market moves too much mid-transaction, everything reverts
              and you keep your money.
            </Step>
            <Step n={2} title="Your position is created, owned by you">
              The two halves go into the official Uniswap v4 pool and the position comes back to your wallet as an NFT. It
              is yours the same way the dollars were: vaults.cash has no key, no admin switch, no way to touch it.
            </Step>
            <Step n={3} title={`Our fee comes last: ${FEE_PCT}% flat`}>
              The final call sends {FEE_PCT}% of your deposit (60¢ on $100) to vaults.cash, as a plain transfer anyone can
              see on the public ledger. If you were referred, half of it goes to your referrer in the same transaction.
            </Step>
            <Step n={4} title="All of it is one transaction">
              Every step above runs as a single batch: it all succeeds or it all reverts as if nothing happened. There is no
              state where your cash is swapped but stuck.
            </Step>
          </ol>
        </Section>

        <Section title="How you earn" sticker={<Chip tone="accent">Live demo</Chip>}>
          <RangeDemo />
          <p className="pt-5 text-sm leading-relaxed text-muted">
            Earned fees accumulate to your position and show on your portfolio as &ldquo;traders paid you&rdquo;; collect
            them any time, or take them along when you withdraw. Estimated APRs come from the pool&apos;s real trading over
            the last 24 hours and are not promises.
          </p>
        </Section>

        <Section title="When you withdraw">
          <WithdrawFlow />
          <p className="pt-5 text-sm leading-relaxed text-muted">
            The position is burned, both halves come back with the fees they earned, and whatever is not the chain&apos;s
            dollar (USDC on Base, USDG on Robinhood Chain) is swapped back to it. The same flat {FEE_PCT}% applies to the
            amount converted on the way out, nothing else. From there you can send it anywhere, including back to an
            exchange.
          </p>
        </Section>

        <Section title="The honest risk list" sticker={<Chip tone="negative">Read this one</Chip>}>
          <ul className="space-y-4 text-sm leading-relaxed text-muted">
            {[
              ["Prices move.", "A position's value tracks the assets in it. Concentrated ranges can underperform simply holding (“impermanent loss”) when prices trend hard in one direction."],
              ["Ranges pause.", "If price leaves your range, your position stops earning until it returns or you reposition. “Set & forget” never pauses but earns a lower rate."],
              ["Contracts are code.", "Your funds sit in Uniswap v4, among the most audited contracts in crypto, but no smart contract is risk-free. vaults.cash adds no contract of its own to that path."],
              ["Some pools are thin.", "Thin pools mean bigger price impact and we badge the quiet ones. We warn you before any deposit where this bites."],
              ["Stock tokens depend on their issuer.", "Robinhood stock tokens track a share price but are not the shares; availability depends on where you live."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <Chip tone="negative">!</Chip>
                <span>
                  <span className="font-display text-base font-extrabold text-foreground">{t}</span> {d}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Don't trust, verify" sticker={<Chip>Public ledger</Chip>}>
          <p className="text-sm leading-relaxed text-muted">
            Every claim above is checkable. Your wallet, your positions, our fee address, every transaction: all public on{" "}
            {CHAIN_IDS.map((id, i) => (
              <span key={id}>
                {i > 0 && " and "}
                <a href={CHAINS[id].explorer.url} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                  the {CHAINS[id].label} explorer
                </a>
              </span>
            ))}
            . Each position on your Portfolio links to itself inside Uniswap&apos;s own app. What we can and can&apos;t do
            is spelled out on{" "}
            <Link href="/trust" className="text-accent underline-offset-2 hover:underline">
              the trust page
            </Link>
            , and the fee schedule on the{" "}
            <Link href="/disclosures" className="text-accent underline-offset-2 hover:underline">
              disclosures page
            </Link>
            .
          </p>
        </Section>

        <div className="pb-4 text-center">
          <Link
            href="/pools"
            className="inline-block rounded-full bg-accent px-9 py-3.5 font-display text-lg font-extrabold text-black transition-colors hover:bg-accent-strong"
          >
            Explore pools
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
