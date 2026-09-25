import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/MarketingShell";
import { ChainChip, Chip, PairIcons } from "@/components/TokenIcon";
import { RangeBar } from "@/components/RangeBar";
import { chainBySlug, explorerNftUrl, uniswapPositionUrl } from "@/lib/chain";
import { fmtUsd } from "@/lib/format";
import { sharePrice } from "@/lib/markets";
import { getMarketPricing, tickToPrice } from "@/lib/onchain";
import { getUncollectedFees, readPosition } from "@/lib/positions";

/** A position's public page: what a share link lands on. Real numbers, no
 *  claims, one green button. */
export const dynamic = "force-dynamic";

type Params = Promise<{ chain: string; tokenId: string }>;

async function load(params: Params) {
  const { chain, tokenId } = await params;
  const cfg = chainBySlug(chain);
  if (!cfg || !/^\d+$/.test(tokenId)) return null;
  const position = await readPosition(cfg.chain.id as 8453 | 4663, BigInt(tokenId));
  if (!position) return null;
  const m = position.market;
  const [{ state, price, quoteUsd, priceUsd }, fees] = await Promise.all([getMarketPricing(m), getUncollectedFees(position).catch(() => ({ owed0: 0n, owed1: 0n }))]);
  const c0 = m.baseIsCurrency0;
  const feesUsd = ((Number(c0 ? fees.owed0 : fees.owed1) / 10 ** m.base.decimals) * price + Number(c0 ? fees.owed1 : fees.owed0) / 10 ** m.quote.decimals) * quoteUsd;
  const lo = tickToPrice(m, position.tickLower) * quoteUsd;
  const hi = tickToPrice(m, position.tickUpper) * quoteUsd;
  return { cfg, chain, position, m, feesUsd, priceUsd: sharePrice(m, priceUsd), lower: sharePrice(m, Math.min(lo, hi)), upper: sharePrice(m, Math.max(lo, hi)), inRange: state.tick >= position.tickLower && state.tick < position.tickUpper };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const d = await load(params);
  if (!d) return { title: "Position" };
  const title = `${d.m.base.symbol} / ${d.m.quote.symbol} position`;
  return {
    title,
    description: `Traders paid this position ${fmtUsd(d.feesUsd)} so far. A real Uniswap v4 position on ${d.cfg.chain.name}, held in its owner's own wallet.`,
    openGraph: { title: `${title} — vaults.cash`, images: [{ url: `/api/share/${d.chain}/${d.position.tokenId}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image" },
  };
}

export default async function SharePage({ params }: { params: Params }) {
  const d = await load(params);
  if (!d) notFound();
  const { cfg, chain, position, m, feesUsd, priceUsd, lower, upper, inRange } = d;
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl animate-rise px-4 py-14 sm:px-6">
        <div className="flex flex-wrap gap-2 pb-4">
          <ChainChip chainId={cfg.chain.id} />
          <Chip tone={inRange ? "accent" : "negative"}>{inRange ? "Earning" : "Out of range"}</Chip>
          <Chip>Uniswap v4 position #{position.tokenId.toString()}</Chip>
        </div>
        <section className="tilt rounded-3xl bg-surface p-6 shadow-card sm:p-8">
          <div className="flex items-center gap-3">
            <PairIcons market={m} size={44} />
            <h1 className="font-display text-3xl font-extrabold tracking-tight">
              {m.base.symbol} <span className="text-muted">/</span> {m.quote.symbol}
            </h1>
          </div>
          <p className="pt-6 text-sm text-muted">Traders paid this position</p>
          <p className="font-display text-6xl font-extrabold tracking-tighter text-accent">+{feesUsd > 0 && feesUsd < 0.01 ? "<$0.01" : fmtUsd(feesUsd)}</p>
          <p className="pt-1 text-xs text-muted">in trading fees, so far, still sitting in the position. Live from the chain.</p>
          <div className="pt-6">
            <RangeBar price={priceUsd} lower={lower} upper={upper} inRange={inRange} />
          </div>
          <div className="flex flex-wrap gap-4 pt-5 text-xs">
            <a href={uniswapPositionUrl(cfg.chain.id, position.tokenId)} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              Open in Uniswap ↗
            </a>
            <a href={explorerNftUrl(cfg.chain.id, position.tokenId)} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              Explorer ↗
            </a>
          </div>
        </section>
        <div className="pt-8 text-center">
          <p className="font-display text-2xl font-extrabold tracking-tight">Every trade pays a fee. Be the one collecting it.</p>
          <p className="mx-auto max-w-md pt-2 text-sm text-muted">
            One tap turns your dollars into a position like this one, held in your own wallet. Not a deposit account, not
            insured; positions carry market risk.
          </p>
          <Link href={`/pools`} className="mt-5 inline-block rounded-full bg-accent px-9 py-3.5 font-display text-lg font-extrabold text-black transition-colors hover:bg-accent-strong">
            Start earning
          </Link>
          <p className="pt-3 text-[11px] text-muted/70">{chain === "base" ? "Base" : cfg.chain.name} · vaults.cash</p>
        </div>
      </div>
    </MarketingShell>
  );
}
