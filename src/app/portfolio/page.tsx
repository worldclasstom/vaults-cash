"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { RangeBar } from "@/components/RangeBar";
import { Chip, MarketChips, PairIcons } from "@/components/TokenIcon";
import { usePlanAdd, useSendDeposit } from "@/hooks/useDeposit";
import { useCollect, usePlanWithdraw, usePositions, useWithdraw, type PositionView } from "@/hooks/usePositions";
import { Sheet } from "@/components/Sheet";
import { SigningSteps } from "@/components/SigningSteps";
import { describeWithdrawCalls } from "@/lib/describeCalls";
import { formatUnits } from "viem";
import { useCashBalances, useQuoteBalance } from "@/hooks/useChainData";
import { CHAINS, explorerNftUrl, uniswapPositionUrl } from "@/lib/chain";
import { fmtAmount, fmtUsd } from "@/lib/format";
import { shareAmount, sharePrice } from "@/lib/markets";
import { tickToPrice } from "@/lib/onchain";
import { planSummary } from "@/lib/zap";
import { MIN_COLLECT_USD, MIN_DEPOSIT_USD } from "@/lib/limits";
import { useStats } from "@/components/PoolList";

function AddPanel({ p, onClose }: { p: PositionView; onClose: () => void }) {
  const { data: balance } = useQuoteBalance(p.market.chainId);
  const stable = CHAINS[p.market.chainId].quote;
  const [amount, setAmount] = useState("");
  const plan = usePlanAdd();
  const send = useSendDeposit();

  const amountNum = Number(amount) || 0;
  const insufficient = balance !== undefined && amountNum > balance.formatted;
  const belowMin = amountNum > 0 && amountNum < MIN_DEPOSIT_USD;

  if (send.isSuccess) {
    return (
      <div className="mt-3 rounded-2xl bg-surface-raised p-4 text-sm">
        <p className="font-semibold text-accent">Added ✓</p>
        <p className="pt-1 text-muted">Your position will reflect it in a few seconds.</p>
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
    const s = planSummary(plan.data, p.market);
    return (
      <div className="mt-3 rounded-2xl bg-surface-raised p-4 text-sm">
        <p className="font-semibold">Confirm add</p>
        <p className="pt-1 text-muted">
          {fmtUsd(amountNum)} → ~{fmtUsd(s.baseUsd)} {p.market.base.symbol} + ~{fmtUsd(s.quoteUsd)} {p.market.quote.symbol} into
          this position&apos;s existing range. Fee {fmtUsd(s.feeUsd)}.
        </p>
        {!p.inRange && (
          <p className="pt-1 text-xs text-muted">
            This position is out of range, so the whole amount converts to one side and won&apos;t earn until price
            returns to the range.
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
        {send.isError && <p className="pt-2 text-xs text-negative">{(send.error as Error).message}</p>}
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
        Minimum {fmtUsd(MIN_DEPOSIT_USD)} · Available: {balance ? fmtUsd(balance.formatted) : "—"} {stable.symbol}
        {insufficient && <span className="text-negative"> — not enough</span>}
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={onClose} className="rounded-full bg-surface px-5 py-2 text-sm font-semibold transition-colors hover:bg-borderline">
          Cancel
        </button>
        <button
          onClick={() => plan.mutate({ position: p, amountUsd: amountNum, slippageBps: 50 })}
          disabled={amountNum <= 0 || belowMin || insufficient || plan.isPending}
          className="grow rounded-full bg-accent py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
        >
          {belowMin ? `Minimum ${fmtUsd(MIN_DEPOSIT_USD)}` : plan.isPending ? "Quoting…" : "Review add"}
        </button>
      </div>
      {plan.isError && <p className="pt-2 text-xs text-negative">{(plan.error as Error).message}</p>}
    </div>
  );
}

function PositionCard({ p }: { p: PositionView }) {
  const { data: stats } = useStats();
  const planWithdraw = usePlanWithdraw();
  const withdraw = useWithdraw();
  const collect = useCollect();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const chain = CHAINS[p.market.chainId];
  const wplan = planWithdraw.data;
  // guaranteed minimum the user ends with, after the fee (stablecoin ≈ $1)
  const receiveMin = wplan ? Number(formatUnits(wplan.stableOutMin - wplan.feeAmount, chain.quote.decimals)) : 0;
  const closeSheet = () => {
    if (withdraw.isPending) return;
    setConfirming(false);
    planWithdraw.reset();
  };
  const collectible = p.feesUsd >= MIN_COLLECT_USD;
  const m = p.market;
  const stable = CHAINS[m.chainId].quote;

  // range in dollars per (display) share
  const lo = tickToPrice(m, p.tickLower) * p.quoteUsd;
  const hi = tickToPrice(m, p.tickUpper) * p.quoteUsd;
  const lower = sharePrice(m, Math.min(lo, hi));
  const upper = sharePrice(m, Math.max(lo, hi));
  const priceUsd = sharePrice(m, p.price * p.quoteUsd);

  return (
    <li className="rounded-3xl bg-surface shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PairIcons market={m} size={38} />
          <div>
            <p className="font-semibold leading-tight">
              {m.base.symbol} <span className="text-muted">/</span> {m.quote.symbol}
            </p>
            <div className="flex flex-wrap items-center gap-1 pt-1">
              <Chip tone={p.inRange ? "accent" : "negative"}>{p.inRange ? "Earning" : "Out of range"}</Chip>
              <MarketChips market={m} stats={stats?.[m.slug]} />
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">{fmtUsd(p.valueUsd)}</p>
          <p className="text-xs text-muted">
            fees earned{" "}
            <span className={p.feesUsd > 0 ? "text-accent" : ""}>
              {p.feesUsd >= 0.01 ? fmtUsd(p.feesUsd) : p.feesUsd > 0 ? "<$0.01" : "$0.00"}
            </span>
          </p>
        </div>
      </div>

      <div className="pt-4">
        <RangeBar price={priceUsd} lower={lower} upper={upper} inRange={p.inRange} compact />
      </div>

      <p className="pt-3 text-sm text-muted">
        Holding {fmtAmount(shareAmount(m, p.baseAmount), 5)} {m.base.symbol} + {fmtAmount(p.quoteAmount, m.quoteIsStable ? 2 : 5)}{" "}
        {m.quote.symbol}
        {!p.inRange && ` · price ${priceUsd < lower ? "below" : "above"} your range`}
      </p>
      <p className="pt-1 text-xs text-muted">
        Position NFT #{p.tokenId.toString()} in your wallet ·{" "}
        <a href={uniswapPositionUrl(m.chainId, p.tokenId)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">
          Open in Uniswap ↗
        </a>{" "}
        ·{" "}
        <a href={explorerNftUrl(m.chainId, p.tokenId)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">
          Explorer ↗
        </a>
      </p>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setAdding(!adding)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong"
        >
          Add
        </button>
        <button
          onClick={() => {
            setConfirming(true);
            planWithdraw.mutate(p);
          }}
          disabled={planWithdraw.isPending || withdraw.isPending || withdraw.isSuccess}
          className="grow rounded-full bg-surface-raised py-2 text-sm font-semibold transition-colors hover:bg-borderline disabled:opacity-40"
        >
          {withdraw.isSuccess ? "Withdrawn ✓" : planWithdraw.isPending ? "Preparing…" : withdraw.isPending ? "Withdrawing…" : `Withdraw to ${stable.symbol}`}
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
      {withdraw.isSuccess && (
        <p className="mt-2 text-xs text-accent">
          Withdrawn. Your {stable.symbol} is in your wallet on {chain.label}; this card will clear in a moment.
        </p>
      )}
      {(planWithdraw.isError || collect.isError) && !confirming && (
        <p className="mt-2 text-xs text-negative">{((planWithdraw.error ?? collect.error) as Error).message}</p>
      )}

      {confirming && !withdraw.isSuccess && (
        <Sheet open onClose={closeSheet} title={`Withdraw ${m.base.symbol} / ${m.quote.symbol}`} busy={withdraw.isPending}>
          {wplan ? (
            <>
              <p className="pt-3 text-3xl font-bold tracking-tight">
                ≥ {fmtUsd(receiveMin)} <span className="text-lg font-semibold text-muted">{stable.symbol}</span>
              </p>
              <p className="pt-1 text-xs text-muted">
                Guaranteed minimum; you usually receive a little more. Position value now {fmtUsd(p.valueUsd)}.
              </p>
              <dl className="space-y-2 py-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Trading fees earned, included</dt>
                  <dd className="font-medium">{p.feesUsd >= 0.01 ? fmtUsd(p.feesUsd) : p.feesUsd > 0 ? "<$0.01" : "$0.00"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">vaults.cash fee ({Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100}%)</dt>
                  <dd className="font-medium">{fmtUsd(Number(formatUnits(wplan.feeAmount, chain.quote.decimals)))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Network fee</dt>
                  <dd className="font-medium">{chain.gasSponsored ? "Covered by vaults.cash" : "Under a cent, in ETH"}</dd>
                </div>
              </dl>
              <p className="pb-2 text-xs text-muted">
                This closes the position. Everything converts back to {stable.symbol} and lands in your wallet on {chain.label} in one
                transaction. You can open a new position anytime.
              </p>
              <SigningSteps steps={describeWithdrawCalls(wplan, p)} />
              <div className="flex gap-2">
                <button
                  onClick={closeSheet}
                  disabled={withdraw.isPending}
                  className="rounded-full bg-surface px-5 py-3 font-semibold transition-colors hover:bg-borderline disabled:opacity-40"
                >
                  Keep it
                </button>
                <button
                  onClick={() => withdraw.mutate({ position: p, plan: wplan }, { onSuccess: () => setConfirming(false) })}
                  disabled={withdraw.isPending}
                  className="grow rounded-full bg-accent py-3 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
                >
                  {withdraw.isPending ? "Withdrawing…" : `Withdraw ${fmtUsd(receiveMin)}`}
                </button>
              </div>
              {withdraw.isError && <p className="mt-2 text-xs text-negative">{(withdraw.error as Error).message}</p>}
            </>
          ) : planWithdraw.isError ? (
            <>
              <p className="pt-3 text-sm text-negative">Couldn&apos;t price this withdrawal: {(planWithdraw.error as Error).message}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={closeSheet} className="rounded-full bg-surface px-5 py-3 font-semibold transition-colors hover:bg-borderline">
                  Close
                </button>
                <button onClick={() => planWithdraw.mutate(p)} className="grow rounded-full bg-accent py-3 font-semibold text-black transition-colors hover:bg-accent-strong">
                  Try again
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3 py-4" aria-busy>
              <div className="h-9 w-40 animate-pulse rounded-lg bg-surface" />
              <div className="h-4 w-64 animate-pulse rounded bg-surface" />
              <div className="h-24 animate-pulse rounded-xl bg-surface" />
              <p className="text-xs text-muted">Pricing your withdrawal against the live pool…</p>
            </div>
          )}
        </Sheet>
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
      <div className="relative overflow-hidden rounded-3xl bg-surface shadow-card p-8 text-center">
        {/* the one playful moment: a few bills leave the drawer */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center gap-10">
          {[-8, 4, -3].map((tilt, i) => (
            <span
              key={i}
              className="animate-bill-escape rounded-md bg-accent/15 px-2 py-0.5 font-mono text-xs font-semibold text-accent"
              style={{ animationDelay: `${i * 0.7}s`, ["--tilt" as string]: `${tilt}deg` } as React.CSSProperties}
            >
              +$
            </span>
          ))}
        </div>
        <p className="font-semibold text-accent">Deposit confirmed ✓</p>
        <p className="pt-2 text-sm text-muted">Your position is on-chain and will show here in a few seconds.</p>
        <div className="mx-auto mt-4 h-1.5 w-24 animate-pulse rounded-full bg-accent/40" />
      </div>
    );
  }
  return (
    <div className="rounded-3xl bg-surface shadow-card p-8 text-center">
      <p className="pb-3 text-muted">No positions yet.</p>
      <Link href="/" className="font-semibold text-accent hover:underline">
        Explore pools →
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
  const fees = (positions ?? []).reduce((s, p) => s + p.feesUsd, 0);
  const earning = (positions ?? []).filter((p) => p.inRange).length;

  return (
    <AppShell>
      {!ready ? null : !authenticated ? (
        <div className="flex grow flex-col items-center justify-center gap-4 py-24">
          <p className="text-muted">Log in to see your portfolio.</p>
          <button onClick={login} className="rounded-full bg-accent px-8 py-3 font-semibold text-black hover:bg-accent-strong">
            Log in
          </button>
        </div>
      ) : (
        <div className="animate-rise py-4">
          <section className="grid grid-cols-2 gap-2 pb-8 sm:grid-cols-4">
            <div className="col-span-2 rounded-3xl bg-surface shadow-card p-5 sm:col-span-2">
              <p className="text-sm text-muted">In positions</p>
              <p className="py-1 text-4xl font-bold tracking-tight">{fmtUsd(total)}</p>
              <p className="text-sm text-muted">
                + {cash ? fmtUsd(cash.totalUsd) : "—"} cash available
                {cash && cash.perChain.filter((c) => c.formatted > 0).length > 1 && (
                  <span className="text-muted/60">
                    {" "}
                    (
                    {cash.perChain
                      .filter((c) => c.formatted > 0)
                      .map((c) => `${fmtUsd(c.formatted)} ${c.symbol}`)
                      .join(" · ")}
                    )
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-3xl bg-surface shadow-card p-5">
              <p className="text-sm text-muted">Fees to collect</p>
              <p className="py-1 text-2xl font-bold text-accent">{fmtUsd(fees)}</p>
            </div>
            <div className="rounded-3xl bg-surface shadow-card p-5">
              <p className="text-sm text-muted">Earning</p>
              <p className="py-1 text-2xl font-bold">
                {positions ? `${earning}/${positions.length}` : "—"}
              </p>
            </div>
          </section>
          <section>
            <h2 className="pb-3 text-lg font-semibold">Positions</h2>
            {isLoading ? (
              <div className="h-28 animate-pulse rounded-3xl bg-surface shadow-card" />
            ) : isError ? (
              <p className="rounded-3xl bg-surface shadow-card p-5 text-sm text-muted">Couldn&apos;t load positions right now — refresh to retry.</p>
            ) : positions && positions.length > 0 ? (
              <ul className="space-y-3">
                {positions.map((p) => (
                  <PositionCard key={`${p.market.chainId}:${p.tokenId.toString()}`} p={p} />
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
