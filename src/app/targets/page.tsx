"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Ladder, LadderStickers, ladderTitle } from "@/components/Ladder";
import { useLadders } from "@/hooks/useTargets";
import { useMarketQuote } from "@/hooks/useChainData";
import { InviteCard } from "@/components/InviteCard";
import { TargetsHowItWorks } from "@/components/TargetsVisuals";
import { marketBySlug, sharePrice } from "@/lib/markets";
import { fmtPrice, fmtUsd } from "@/lib/format";
import type { LadderView } from "@/lib/ladders";

function LadderCard({ v }: { v: LadderView }) {
  const paid = v.feesUsd + v.feesPaidUsd;
  return (
    <li>
      <Link href={`/targets/${v.id}`} className="tilt block rounded-3xl bg-surface p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <LadderStickers v={v} />
            <p className="pt-2 font-display text-2xl font-extrabold tracking-tight">{ladderTitle(v)}</p>
            <p className="text-sm text-muted">now ${fmtPrice(v.priceNow)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">paid so far</p>
            <p className="font-display text-2xl font-extrabold tracking-tight text-accent">{paid > 0 && paid < 0.005 ? "+<$0.01" : `+${fmtUsd(paid)}`}</p>
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-gradient-to-r from-accent-deep to-accent" style={{ width: `${Math.round((v.done / Math.max(1, v.total)) * 100)}%` }} />
        </div>
        <p className="pt-1.5 text-xs text-muted">
          {v.done} of {v.total} rungs {v.direction === "up" ? "sold" : "filled"}
          {v.status === "open" && v.done === 0 && (v.direction === "up" ? " · waiting for a climb" : " · waiting for a dip")}
        </p>
        <div className="mt-3">
          <Ladder v={v} compact />
        </div>
      </Link>
    </li>
  );
}

/** A believable example target: today's TSLA price plus ~15%, rounded to a round number. */
function useExampleTarget() {
  const tsla = marketBySlug("robinhood/tsla-usdg");
  const { data: q } = useMarketQuote(tsla);
  if (!tsla || !q) return { symbol: "TSLA", target: 420 };
  const now = sharePrice(tsla, q.priceUsd);
  const raw = now * 1.15;
  const step = raw >= 500 ? 25 : raw >= 100 ? 10 : 5;
  return { symbol: tsla.base.symbol, target: Math.ceil(raw / step) * step };
}

export default function TargetsPage() {
  const { ready, authenticated, login } = useAuth();
  const { data, isLoading, isError } = useLadders();
  const example = useExampleTarget();
  const open = (data ?? []).filter((v) => v.status !== "closed" && v.status !== "cancelled");
  const past = (data ?? []).filter((v) => v.status === "closed" || v.status === "cancelled");
  return (
    <AppShell>
      {!ready ? null : !authenticated ? (
        <div className="animate-rise py-4">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Targets</h1>
          <p className="pt-1 pb-4 text-sm text-muted">Pick a price you believe in. Earn fees on every step there.</p>
          <TargetsHowItWorks cta={false} example={example} />
          <div className="flex flex-col items-center gap-3 py-8">
            <button onClick={login} className="attract rounded-full bg-accent px-8 py-3 font-display font-extrabold text-black hover:bg-accent-strong">
              Log in to set a target
            </button>
          </div>
        </div>
      ) : (
        <div className="animate-rise py-4">
          <div className="flex items-end justify-between gap-3 pb-4">
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight">Targets</h1>
              <p className="pt-1 text-sm text-muted">Pick a price you believe in. Earn fees on every step there.</p>
            </div>
            <Link href="/targets/new" className="attract shrink-0 rounded-full bg-accent px-5 py-2.5 font-display text-sm font-extrabold text-black hover:bg-accent-strong">
              Set a target
            </Link>
          </div>
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-3xl bg-surface shadow-card" />
          ) : isError ? (
            <p className="rounded-3xl bg-surface shadow-card p-5 text-sm text-muted">Couldn&apos;t load your targets — refresh to retry.</p>
          ) : open.length === 0 ? (
            <TargetsHowItWorks example={example} />
          ) : (
            <ul className="space-y-3">
              {open.map((v) => (
                <LadderCard key={v.id} v={v} />
              ))}
            </ul>
          )}
          <InviteCard className="mt-8" />
          {past.length > 0 && (
            <section className="pt-8">
              <h2 className="pb-3 font-display text-xl font-extrabold tracking-tight">Past targets</h2>
              <ul className="space-y-3">
                {past.map((v) => (
                  <LadderCard key={v.id} v={v} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
