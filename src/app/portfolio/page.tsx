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
import { useActivities, useActivity } from "@/hooks/useActivity";
import { useReferral } from "@/hooks/useReferral";
import type { Activity } from "@/lib/activity";
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

const FEE_RATE = Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 10_000;

const fmtEarned = (n: number) => (n >= 0.01 ? `+${fmtUsd(n)}` : n > 0 ? "+<$0.01" : "$0.00");
const ago = (ts: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
};

/** The reason to open the app: what traders paid you today, across positions. */
function TodayLine({ positions }: { positions: PositionView[] }) {
  const results = useActivities(positions);
  const loaded = results.filter((r) => r.data);
  if (!positions.length) return null;
  const today = loaded.reduce((s, r) => s + (r.data as Activity).todayUsd, 0);
  const trades = loaded.reduce((s, r) => s + (r.data as Activity).tradesInRangeToday, 0);
  const pending = loaded.length < positions.length;
  return (
    <section className="relative mb-4 overflow-hidden rounded-3xl bg-surface p-5 shadow-card">
      <p className="text-sm text-muted">Traders paid you today</p>
      <p className={`font-display text-5xl font-extrabold tracking-tighter ${today > 0 ? "text-accent" : ""}`}>
        {pending && !loaded.length ? "…" : fmtEarned(today)}
      </p>
      <p className="pt-1 text-sm text-muted">
        {pending && !loaded.length
          ? "Counting today's trades…"
          : trades > 0
            ? `${trades.toLocaleString()} trade${trades === 1 ? "" : "s"} crossed your range in the last 24 hours${pending ? " (still counting)" : ""}.`
            : "No trades have crossed your range in the last 24 hours yet."}
      </p>
      {today > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-6 flex items-end gap-6 pb-4">
          {[0, 0.7].map((d, i) => (
            <span key={i} className="animate-cash-up font-display text-lg font-extrabold text-accent" style={{ animationDelay: `${d}s` }}>
              +$
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** The trades that paid this position, newest first. */
function TradeFeed({ p, a }: { p: PositionView; a: Activity }) {
  const m = p.market;
  return (
    <details className="mt-3 rounded-2xl bg-surface-raised p-3 text-sm">
      <summary className="cursor-pointer text-muted">
        <span className="font-display font-bold text-foreground">Today {fmtEarned(a.todayUsd)}</span> · {a.tradesInRangeToday.toLocaleString()} of{" "}
        {a.tradesToday.toLocaleString()} trades were in your range{a.partial ? " (so far)" : ""} · recent trades
      </summary>
      <ul className="mt-2 divide-y divide-borderline">
        {a.recent.slice(0, 6).map((t) => (
          <li key={t.txHash + t.block} className="flex items-center justify-between gap-3 py-2">
            <span className={t.inRange ? "" : "text-muted"}>
              Someone {t.side} {fmtAmount(shareAmount(m, t.baseAmount), 4)} {m.base.symbol}{" "}
              <span className="text-muted">({fmtUsd(t.usd)})</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
              <span className={`font-display font-bold ${t.inRange && t.earnedUsd > 0 ? "text-accent" : ""}`}>
                {t.inRange ? (t.earnedUsd >= 0.001 ? `+${fmtUsd(t.earnedUsd)}` : "+<$0.001") : "outside range"}
              </span>
              {ago(t.ts)}
            </span>
          </li>
        ))}
        {a.recent.length === 0 && <li className="py-2 text-muted">No trades in this pool in the last 24 hours.</li>}
      </ul>
    </details>
  );
}

/** Share a position: a card image, a link with your invite code, the native share sheet when there is one. */
function ShareSheet({ p, onClose }: { p: PositionView; onClose: () => void }) {
  const { data: ref } = useReferral();
  const [copied, setCopied] = useState(false);
  const slug = CHAINS[p.market.chainId].slug;
  const url = `https://vaults.cash/p/${slug}/${p.tokenId}${ref?.refCode ? `?ref=${ref.refCode}` : ""}`;
  const img = `/api/share/${slug}/${p.tokenId}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <Sheet open onClose={onClose} title="Share this position">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt={`${p.market.base.symbol} / ${p.market.quote.symbol} position card`} className="mt-3 w-full rounded-2xl shadow-elevated" />
      <p className="pt-3 text-xs text-muted">
        A live card: pair, what traders have paid this position, and where the price sits. The link opens a public page
        with the same numbers{ref?.refCode ? " and carries your invite code, so anyone who joins from it pays you half our fee" : ""}.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="grow rounded-full bg-surface px-5 py-3 font-semibold transition-colors hover:bg-borderline"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
        {canShare && (
          <button
            onClick={() => navigator.share({ title: "Traders are paying me", text: "Every trade pays a fee. I'm the one collecting it.", url }).catch(() => undefined)}
            className="grow rounded-full bg-accent py-3 font-semibold text-black transition-colors hover:bg-accent-strong"
          >
            Share
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Fills as trades pay the position back the fee it cost to enter — the
 *  honest version of a progress bar: once it's full, everything is profit. */
function FeeBar({ feesUsd, valueUsd }: { feesUsd: number; valueUsd: number }) {
  const entryFee = valueUsd * FEE_RATE;
  const pct = entryFee > 0 ? Math.min(100, (feesUsd / entryFee) * 100) : 0;
  const covered = pct >= 100;
  return (
    <div className="pt-3">
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-deep to-accent transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(pct, feesUsd > 0 ? 3 : 0)}%` }}
        />
      </div>
      <p className="pt-1.5 text-xs text-muted">
        {covered
          ? "Entry fee covered — every fee from here is profit."
          : `${pct.toFixed(0)}% of the way to covering the ${fmtUsd(entryFee)} entry fee.`}
      </p>
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
  const [sharing, setSharing] = useState(false);
  const activity = useActivity(p);
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
    <li className="tilt rounded-3xl bg-surface shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PairIcons market={m} size={38} />
          <div>
            <p className="font-display text-xl font-bold leading-tight">
              {m.base.symbol} <span className="text-muted">/</span> {m.quote.symbol}
            </p>
            <div className="flex flex-wrap items-center gap-1 pt-1">
              <Chip tone={p.inRange ? "accent" : "negative"}>{p.inRange ? "Earning" : "Out of range"}</Chip>
              <MarketChips market={m} stats={stats?.[m.slug]} />
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-extrabold tracking-tight">{fmtUsd(p.valueUsd)}</p>
          <p className="text-xs text-muted">
            traders paid you{" "}
            <span className={`font-display font-bold ${p.feesUsd > 0 ? "text-accent" : ""}`}>
              {p.feesUsd >= 0.01 ? `+${fmtUsd(p.feesUsd)}` : p.feesUsd > 0 ? "+<$0.01" : "$0.00"}
            </span>
          </p>
        </div>
      </div>

      <div className="pt-4">
        <RangeBar price={priceUsd} lower={lower} upper={upper} inRange={p.inRange} compact />
      </div>

      {/* the fee bar: how far the fees traders paid have gone toward covering the 0.6% it cost to enter */}
      <FeeBar feesUsd={p.feesUsd} valueUsd={p.valueUsd} />

      {activity.data ? (
        <TradeFeed p={p} a={activity.data} />
      ) : activity.isError ? null : (
        <div className="mt-3 h-10 animate-pulse rounded-2xl bg-surface-raised" />
      )}

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
          onClick={() => setSharing(true)}
          className="rounded-full bg-surface-raised px-4 py-2 text-sm text-muted transition-colors hover:bg-borderline hover:text-foreground"
        >
          Share
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
      {sharing && <ShareSheet p={p} onClose={() => setSharing(false)} />}
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
                  <dt className="text-muted">Gas (network fee)</dt>
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
        {/* money landing: +$ pops up while the position indexes */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-around px-10">
          {[0, 0.5, 1, 1.5].map((delay, i) => (
            <span key={i} className="animate-cash-up font-display text-lg font-extrabold text-accent" style={{ animationDelay: `${delay}s` }}>
              +$
            </span>
          ))}
        </div>
        <p className="font-display text-2xl font-extrabold text-accent">Deposit confirmed</p>
        <p className="pt-2 text-sm text-muted">Your position is on-chain and will show here in a few seconds.</p>
        <div className="mx-auto mt-4 h-1.5 w-24 animate-pulse rounded-full bg-accent/40" />
      </div>
    );
  }
  return (
    <div className="rounded-3xl bg-surface shadow-card p-8 text-center">
      <p className="font-display text-2xl font-extrabold">Nothing earning yet</p>
      <p className="pt-2 text-sm text-muted">Pick a pool, type a dollar amount, and traders start paying you on the next trade.</p>
      <Link href="/pools" className="mt-5 inline-block rounded-full bg-accent px-7 py-3 font-display text-base font-extrabold text-black transition-colors hover:bg-accent-strong">
        Explore pools
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
              <p className="py-1 font-display text-6xl font-extrabold tracking-tighter">{fmtUsd(total)}</p>
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
              <p className="py-1 font-display text-3xl font-extrabold tracking-tight text-accent">{fmtUsd(fees)}</p>
            </div>
            <div className="rounded-3xl bg-surface shadow-card p-5">
              <p className="text-sm text-muted">Earning</p>
              <p className="py-1 font-display text-3xl font-extrabold tracking-tight">
                {positions ? `${earning}/${positions.length}` : "—"}
              </p>
            </div>
          </section>
          {positions && positions.length > 0 && <TodayLine positions={positions} />}
          <section>
            <h2 className="pb-3 font-display text-2xl font-extrabold tracking-tight">Positions</h2>
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
