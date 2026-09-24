"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { usePlanAdd, useSendDeposit } from "@/hooks/useDeposit";
import { useCollect, usePositions, useWithdraw, type PositionView } from "@/hooks/usePositions";
import { useCashBalances, useQuoteBalance } from "@/hooks/useChainData";
import { fmtAmount, fmtUsd } from "@/lib/format";
import { shareAmount } from "@/lib/markets";
import { planSummary } from "@/lib/zap";

/** don't offer collection below this — it wouldn't meaningfully beat gas */
const MIN_COLLECT_USD = 0.05;

function AddPanel({ p, onClose }: { p: PositionView; onClose: () => void }) {
  const { data: balance } = useQuoteBalance(p.market.chainId);
  const [amount, setAmount] = useState("");
  const plan = usePlanAdd();
  const send = useSendDeposit();

  const amountNum = Number(amount) || 0;
  const insufficient = balance !== undefined && amountNum > balance.formatted;

  if (send.isSuccess) {
    return (
      <div className="mt-3 rounded-2xl bg-surface-raised p-4 text-sm">
        <p className="font-semibold text-accent">Added ✓</p>
        <p className="pt-1 text-muted">
          Your position will reflect it in a few seconds.
        </p>
        <button
          onClick={onClose}
          className="mt-3 rounded-full bg-surface px-5 py-2 text-sm font-semibold transition-colors hover:bg-borderline"
        >
          Done
        </button>
      </div>
    );
  }

  if (plan.isSuccess) {
    const s = planSummary(plan.data, p.price, p.market.tokenDecimals);
    return (
      <div className="mt-3 rounded-2xl bg-surface-raised p-4 text-sm">
        <p className="font-semibold">Confirm add</p>
        <p className="pt-1 text-muted">
          {fmtUsd(amountNum)} → ~{fmtUsd(s.assetUsd)} {p.market.symbol} + ~
          {fmtUsd(s.usdcUsd)} USDC into this position&apos;s existing range.
          Fee {fmtUsd(s.feeUsd)}.
        </p>
        {!p.inRange && (
          <p className="pt-1 text-xs text-muted">
            This position is out of range, so the whole amount converts to one
            side and won&apos;t earn until price returns to the range.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => plan.reset()}
            disabled={send.isPending}
            className="rounded-full bg-surface px-5 py-2 text-sm font-semibold transition-colors hover:bg-borderline disabled:opacity-40"
          >
            Back
          </button>
          <button
            onClick={() => send.mutate(plan.data)}
            disabled={send.isPending}
            className="grow rounded-full bg-accent py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
          >
            {send.isPending ? "Adding…" : "Add"}
          </button>
        </div>
        {send.isError && (
          <p className="pt-2 text-xs text-negative">{(send.error as Error).message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-surface-raised p-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted">$</span>
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className="w-full rounded-xl bg-surface p-3 font-mono outline-none placeholder:text-muted/50"
        />
        <button
          onClick={() => balance && setAmount(String(balance.formatted))}
          className="rounded-full bg-surface px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-borderline hover:text-foreground"
        >
          Max
        </button>
      </div>
      <p className="pt-1 text-xs text-muted">
        Available: {balance ? fmtUsd(balance.formatted) : "—"} {p.market.quote.symbol}
        {insufficient && <span className="text-negative"> — not enough</span>}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onClose}
          className="rounded-full bg-surface px-5 py-2 text-sm font-semibold transition-colors hover:bg-borderline"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            plan.mutate({ position: p, amountUsd: amountNum, slippageBps: 50 })
          }
          disabled={amountNum <= 0 || insufficient || plan.isPending}
          className="grow rounded-full bg-accent py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
        >
          {plan.isPending ? "Quoting…" : "Review add"}
        </button>
      </div>
      {plan.isError && (
        <p className="pt-2 text-xs text-negative">{(plan.error as Error).message}</p>
      )}
    </div>
  );
}

function PositionCard({ p }: { p: PositionView }) {
  const withdraw = useWithdraw();
  const collect = useCollect();
  const [adding, setAdding] = useState(false);
  const collectible = p.feesUsd >= MIN_COLLECT_USD;

  return (
    <li className="rounded-3xl bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">
            {p.market.symbol} / {p.market.quote.symbol}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                p.inRange ? "bg-accent/15 text-accent" : "bg-negative/15 text-negative"
              }`}
            >
              {p.inRange ? "Earning" : "Out of range"}
            </span>
          </p>
          <p className="text-sm text-muted">
            {fmtAmount(shareAmount(p.market, p.assetAmount), 5)} {p.market.symbol} + {fmtUsd(p.usdcAmount)}
          </p>
          <p className="text-sm">
            <span className="text-muted">Fees earned: </span>
            <span className={p.feesUsd > 0 ? "text-accent" : "text-muted"}>
              {p.feesUsd >= 0.01 ? fmtUsd(p.feesUsd) : p.feesUsd > 0 ? "<$0.01" : "$0.00"}
            </span>
          </p>
        </div>
        <p className="text-xl font-bold">{fmtUsd(p.valueUsd)}</p>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setAdding(!adding)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong"
        >
          Add
        </button>
        <button
          onClick={() => withdraw.mutate(p)}
          disabled={withdraw.isPending}
          className="grow rounded-full bg-surface-raised py-2 text-sm font-semibold transition-colors hover:bg-borderline disabled:opacity-40"
        >
          {withdraw.isPending ? "Withdrawing…" : `Withdraw to ${p.market.quote.symbol}`}
        </button>
        <button
          onClick={() => collect.mutate(p)}
          disabled={collect.isPending || !collectible}
          title={collectible ? undefined : `Collect unlocks at ${fmtUsd(MIN_COLLECT_USD)} earned`}
          className="rounded-full bg-surface-raised px-4 py-2 text-sm text-muted transition-colors hover:bg-borderline hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {collect.isPending ? "Collecting…" : "Collect fees"}
        </button>
      </div>
      {adding && <AddPanel p={p} onClose={() => setAdding(false)} />}
      {(withdraw.isError || collect.isError) && (
        <p className="mt-2 text-xs text-negative">
          {((withdraw.error ?? collect.error) as Error).message}
        </p>
      )}
    </li>
  );
}

/** Arriving straight from a confirmed deposit (?deposited=1) with an empty
 *  list means the NFT indexer hasn't caught up yet — not that the money
 *  vanished. useSearchParams needs a Suspense boundary on a static page. */
function EmptyPositions() {
  const justDeposited = !!useSearchParams().get("deposited");
  if (justDeposited) {
    return (
      <div className="rounded-3xl bg-surface p-8 text-center">
        <p className="font-semibold text-accent">Deposit confirmed ✓</p>
        <p className="pt-2 text-sm text-muted">
          Your position is on-chain and will show here in a few seconds.
        </p>
        <div className="mx-auto mt-4 h-1.5 w-24 animate-pulse rounded-full bg-accent/40" />
      </div>
    );
  }
  return (
    <div className="rounded-3xl bg-surface p-8 text-center">
      <p className="pb-3 text-muted">No positions yet.</p>
      <Link href="/" className="font-semibold text-accent hover:underline">
        Explore markets →
      </Link>
    </div>
  );
}

export default function PortfolioPage() {
  const { ready, authenticated, login } = useAuth();
  const { data: positions, isLoading, isError } = usePositions();
  const { data: cash } = useCashBalances();
  const router = useRouter();
  // once the deposit shows up, drop ?deposited=1 so a later empty list (after
  // withdrawing everything) reads as "no positions", not "still indexing"
  useEffect(() => {
    if (positions && positions.length > 0 && window.location.search.includes("deposited")) {
      router.replace("/portfolio");
    }
  }, [positions, router]);

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
              + {cash ? fmtUsd(cash.totalUsd) : "—"} cash available
              {cash && cash.perChain.filter((c) => c.formatted > 0).length > 1 && (
                <span className="text-muted/60">
                  {" "}
                  ({cash.perChain
                    .filter((c) => c.formatted > 0)
                    .map((c) => `${fmtUsd(c.formatted)} ${c.symbol}`)
                    .join(" · ")})
                </span>
              )}
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
              <Suspense fallback={null}>
                <EmptyPositions />
              </Suspense>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
