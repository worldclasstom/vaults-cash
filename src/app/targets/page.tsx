"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Ladder, LadderStickers, ladderTitle } from "@/components/Ladder";
import { useLadders } from "@/hooks/useTargets";
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

export default function TargetsPage() {
  const { ready, authenticated, login } = useAuth();
  const { data, isLoading, isError } = useLadders();
  const open = (data ?? []).filter((v) => v.status !== "closed" && v.status !== "cancelled");
  const past = (data ?? []).filter((v) => v.status === "closed" || v.status === "cancelled");
  return (
    <AppShell>
      {!ready ? null : !authenticated ? (
        <div className="flex grow flex-col items-center justify-center gap-4 py-24">
          <p className="text-muted">Log in to set a target.</p>
          <button onClick={login} className="rounded-full bg-accent px-8 py-3 font-semibold text-black hover:bg-accent-strong">
            Log in
          </button>
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
            <div className="rounded-3xl bg-surface shadow-card p-8 text-center">
              <p className="font-display text-2xl font-extrabold">Pick a price you believe in.</p>
              <p className="pt-2 text-sm text-muted">
                Think TSLA hits $420? We build a ladder of narrow positions from here to there. Every step it climbs sells a slice and pays
                you the trading fee. Think it dips? The same ladder buys on the way down.
              </p>
              <Link href="/targets/new" className="mt-5 inline-block rounded-full bg-accent px-7 py-3 font-display text-base font-extrabold text-black hover:bg-accent-strong">
                Set a target
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {open.map((v) => (
                <LadderCard key={v.id} v={v} />
              ))}
            </ul>
          )}
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
