"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useCollect, usePositions, useWithdraw, type PositionView } from "@/hooks/usePositions";
import { useUsdgBalance } from "@/hooks/useChainData";
import { fmtAmount, fmtUsd } from "@/lib/format";

function PositionCard({ p }: { p: PositionView }) {
  const withdraw = useWithdraw();
  const collect = useCollect();

  return (
    <li className="rounded-3xl bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">
            {p.market.symbol} / USDG
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                p.inRange ? "bg-accent/15 text-accent" : "bg-negative/15 text-negative"
              }`}
            >
              {p.inRange ? "Earning" : "Out of range"}
            </span>
          </p>
          <p className="text-sm text-muted">
            {fmtAmount(p.assetAmount, 5)} {p.market.symbol} + {fmtUsd(p.usdgAmount)}
          </p>
        </div>
        <p className="text-xl font-bold">{fmtUsd(p.valueUsd)}</p>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => withdraw.mutate(p)}
          disabled={withdraw.isPending}
          className="grow rounded-full bg-surface-raised py-2 text-sm font-semibold transition-colors hover:bg-borderline disabled:opacity-40"
        >
          {withdraw.isPending ? "Withdrawing…" : "Withdraw to USDG"}
        </button>
        <button
          onClick={() => collect.mutate(p)}
          disabled={collect.isPending}
          className="rounded-full bg-surface-raised px-4 py-2 text-sm text-muted transition-colors hover:bg-borderline hover:text-foreground disabled:opacity-40"
        >
          {collect.isPending ? "Collecting…" : "Collect fees"}
        </button>
      </div>
      {(withdraw.isError || collect.isError) && (
        <p className="mt-2 text-xs text-negative">
          {((withdraw.error ?? collect.error) as Error).message}
        </p>
      )}
    </li>
  );
}

export default function PortfolioPage() {
  const { ready, authenticated, login } = usePrivy();
  const { data: positions, isLoading, isError } = usePositions();
  const { data: balance } = useUsdgBalance();

  const total = (positions ?? []).reduce((s, p) => s + p.valueUsd, 0);

  return (
    <AppShell>
      {!ready ? null : !authenticated ? (
        <div className="flex grow flex-col items-center justify-center gap-4 py-24">
          <p className="text-muted">Log in to see your portfolio.</p>
          <button
            onClick={login}
            className="rounded-full bg-accent px-8 py-3 font-semibold text-black hover:bg-accent-strong"
          >
            Log in
          </button>
        </div>
      ) : (
        <div className="animate-rise py-4">
          <section className="pb-8">
            <p className="text-sm text-muted">Total invested</p>
            <p className="py-1 text-5xl font-bold tracking-tight">{fmtUsd(total)}</p>
            <p className="text-sm text-muted">
              + {balance ? fmtUsd(balance.formatted) : "—"} USDG available
            </p>
          </section>
          <section>
            <h2 className="pb-3 text-lg font-semibold">Positions</h2>
            {isLoading ? (
              <div className="h-28 animate-pulse rounded-3xl bg-surface" />
            ) : isError ? (
              <p className="rounded-3xl bg-surface p-5 text-sm text-muted">
                Couldn&apos;t load positions right now — refresh to retry.
              </p>
            ) : positions && positions.length > 0 ? (
              <ul className="space-y-3">
                {positions.map((p) => (
                  <PositionCard key={p.tokenId.toString()} p={p} />
                ))}
              </ul>
            ) : (
              <div className="rounded-3xl bg-surface p-8 text-center">
                <p className="pb-3 text-muted">No positions yet.</p>
                <Link href="/" className="font-semibold text-accent hover:underline">
                  Explore markets →
                </Link>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
