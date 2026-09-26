import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/MarketingShell";
import { ChainChip, Chip } from "@/components/TokenIcon";
import { Ladder } from "@/components/Ladder";
import { ladderById, ladderView } from "@/lib/ladders";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { marketBySlug, sharePrice } from "@/lib/markets";

/** A target's public page: what its share link lands on. Real numbers, no wallet, one green button. */
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

async function load(params: Params) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return null;
  const full = await ladderById(Number(id)).catch(() => null);
  if (!full) return null;
  const view = await ladderView(full.ladder, full.rungs).catch(() => null);
  const market = view ? marketBySlug(view.marketSlug) : undefined;
  if (!view || !market) return null;
  const hit = view.status === "hit" || view.status === "closed" || (view.total > 0 && view.done === view.total);
  return { view, market, hit, paid: view.feesUsd + view.feesPaidUsd };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const d = await load(params);
  if (!d) return { title: "Target" };
  const title = `${d.view.base} ${d.view.direction === "up" ? "→" : "↓"} $${fmtPrice(sharePrice(d.market, d.view.targetPrice))}`;
  return {
    title,
    description: `${d.hit ? "Target hit." : "A target in progress."} Traders paid this ladder ${fmtUsd(d.paid)} on the way. Real Uniswap v4 positions on ${d.view.chain}, held in the owner's own wallet.`,
    openGraph: { title: `${title} — vaults.cash`, images: [{ url: `/api/share/target/${d.view.id}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image" },
  };
}

export default async function TargetSharePage({ params }: { params: Params }) {
  const d = await load(params);
  if (!d) notFound();
  const { view, market, hit, paid } = d;
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl animate-rise px-4 py-14 sm:px-6">
        <div className="flex flex-wrap gap-2 pb-4">
          <ChainChip chainId={view.chainId} />
          <Chip tone={hit ? "accent" : "outline"}>{hit ? "Target hit" : view.direction === "up" ? "Climbing" : "Filling"}</Chip>
          <Chip>{view.total} Uniswap v4 positions</Chip>
        </div>
        <section className="tilt rounded-3xl bg-surface p-6 shadow-card sm:p-8">
          <p className="text-sm text-muted">{hit ? "Traders paid this ladder on the way" : "Traders paid this ladder so far"}</p>
          <p className="font-display text-6xl font-extrabold tracking-tighter text-accent">+{fmtUsd(paid)}</p>
          <p className="pt-3 font-display text-3xl font-extrabold tracking-tight">
            {view.base} ${fmtPrice(sharePrice(market, view.startPrice))} {view.direction === "up" ? "→" : "↓"} ${fmtPrice(sharePrice(market, view.targetPrice))}
          </p>
          <p className="text-sm text-muted">
            now ${fmtPrice(sharePrice(market, view.priceNow))} · {view.done} of {view.total} rungs {view.direction === "up" ? "sold" : "filled"}
          </p>
          <div className="mt-5">
            <Ladder v={view} compact />
          </div>
        </section>
        <section className="mt-6 rounded-3xl bg-surface p-6 shadow-card sm:p-8">
          <p className="font-display text-2xl font-extrabold tracking-tight">Pick a price you believe in.</p>
          <p className="pt-2 text-sm text-muted">
            A target is a ladder of narrow Uniswap positions between today&apos;s price and the one you believe in. Every trade that
            crosses a rung pays you the pool fee. Your money stays in your own wallet the whole time.
          </p>
          <Link href="/targets/new" className="mt-5 inline-block rounded-full bg-accent px-7 py-3 font-display text-base font-extrabold text-black hover:bg-accent-strong">
            Set your own target
          </Link>
        </section>
      </div>
    </MarketingShell>
  );
}
