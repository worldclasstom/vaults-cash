"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { GasLine } from "@/components/GasLine";
import { GasNote } from "@/components/GasNote";
import { Select } from "@/components/Select";
import { AssetPicker } from "@/components/AssetPicker";
import { Sheet } from "@/components/Sheet";
import { ChainChip, Chip } from "@/components/TokenIcon";
import { useMarketQuote, useQuoteBalance } from "@/hooks/useChainData";
import { useAgentAccessOn, usePlanLadder, useSendLadder } from "@/hooks/useTargets";
import { useGrantAgentAccess } from "@/hooks/useAgentAccess";
import { CHAINS, type ChainId } from "@/lib/chain";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { spendableUsd } from "@/lib/gasToken";
import { minDepositUsd } from "@/lib/limits";
import { MARKETS, marketBySlug, sharePrice } from "@/lib/markets";
import { DEFAULT_RUNGS, MAX_RUNGS, MIN_RUNGS, type Direction, type LadderPlan } from "@/lib/targets";

const EXPIRY: Array<{ value: string; label: string; days: number | null }> = [
  { value: "never", label: "Never", days: null },
  { value: "1w", label: "1 week", days: 7 },
  { value: "1m", label: "1 month", days: 30 },
  { value: "3m", label: "3 months", days: 90 },
];

export default function NewTargetPage() {
  const router = useRouter();
  const { ready, authenticated, login } = useAuth();
  // stock tokens front and center, then the rest, stablecoin-quoted pairs only (rungs are priced in dollars)
  const markets = useMemo(() => {
    const list = MARKETS.filter((m) => m.quoteIsStable);
    return [...list.filter((m) => m.kind === "stock"), ...list.filter((m) => m.kind !== "stock")];
  }, []);
  const [slug, setSlug] = useState(markets[0]?.slug ?? "");
  const market = marketBySlug(slug) ?? markets[0];
  const chain = CHAINS[market.chainId];
  const { data: quote } = useMarketQuote(market);
  const { data: balance } = useQuoteBalance(market.chainId);
  const priceNow = quote ? sharePrice(market, quote.priceUsd) : undefined;

  const [direction, setDirection] = useState<Direction>("up");
  const [target, setTarget] = useState("");
  const [rungs, setRungs] = useState(DEFAULT_RUNGS);
  const [amount, setAmount] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [autoClose, setAutoClose] = useState(true);
  const [plan, setPlan] = useState<LadderPlan | null>(null);
  const keeper = !!process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
  const { data: agentOn } = useAgentAccessOn();
  const grant = useGrantAgentAccess();
  // the box can only be on when the keeper is configured AND this account granted it
  const canAutoClose = keeper && !!agentOn;
  const planMutation = usePlanLadder();
  const sendMutation = useSendLadder();

  const targetNum = Number(target) || 0;
  const amountNum = Number(amount) || 0;
  const pct = priceNow && targetNum ? ((targetNum - priceNow) / priceNow) * 100 : 0;
  const wrongWay = priceNow !== undefined && targetNum > 0 && (direction === "up" ? targetNum <= priceNow : targetNum >= priceNow);
  const insufficient = balance !== undefined && amountNum > spendableUsd(market.chainId, balance.formatted);
  const minDep = minDepositUsd(market.chainId);
  const belowMin = amountNum > 0 && amountNum < minDep;
  const canReview = !!priceNow && targetNum > 0 && !wrongWay && amountNum >= minDep && !insufficient;
  const preset = (p: number) => priceNow && setTarget((priceNow * (1 + p / 100)).toFixed(2));
  // computed at submit time, not during render
  const expiresAtNow = () => {
    const e = EXPIRY.find((x) => x.value === expiry);
    return e?.days ? new Date(Date.now() + e.days * 86_400_000).toISOString() : null;
  };

  // the ladder is priced with a multiplied display price for stock tokens; the plan needs the raw token price
  const rawTarget = targetNum / (market.base.uiMultiplier || 1);

  return (
    <AppShell>
      <div className="animate-rise py-4">
        <Link href="/targets" className="text-sm text-muted hover:text-foreground">
          ← Targets
        </Link>
        <h1 className="pt-2 font-display text-3xl font-extrabold tracking-tight">Set a target</h1>
        <p className="pt-1 text-sm text-muted">Three questions. Every rung is a Uniswap position in your own wallet.</p>

        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_320px]">
          <section className="space-y-5 rounded-3xl bg-surface p-5 shadow-card">
            <div>
              <p className="pb-2 text-sm font-semibold">Which asset?</p>
              <AssetPicker
                markets={markets}
                value={market}
                onChange={(m) => {
                  setSlug(m.slug);
                  setTarget("");
                  setPlan(null);
                }}
              />
              <p className="pt-2 text-sm text-muted">
                <ChainChip chainId={market.chainId} /> now {priceNow ? `$${fmtPrice(priceNow)}` : "—"}
              </p>
            </div>

            <div>
              <p className="pb-2 text-sm font-semibold">Which way?</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["up", "Sell on the way up", "I think it climbs. Each rung sells a slice and pays me the fee."],
                    ["down", "Buy on the way down", "I think it dips. Each rung buys a slice and pays me the fee."],
                  ] as Array<[Direction, string, string]>
                ).map(([d, label, blurb]) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDirection(d);
                      setTarget("");
                      setPlan(null);
                    }}
                    className={`rounded-2xl p-3 text-left transition-colors ${direction === d ? "bg-surface-raised ring-2 ring-accent" : "bg-surface-raised/60 hover:bg-surface-raised"}`}
                  >
                    <span className="block font-display text-base font-extrabold">{label}</span>
                    <span className="block pt-1 text-xs text-muted">{blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="pb-2 text-sm font-semibold">How far?</p>
              <div className="flex items-baseline gap-2 rounded-2xl bg-surface-raised px-4 py-3">
                <span className="font-display text-2xl font-extrabold text-muted">$</span>
                <input
                  inputMode="decimal"
                  placeholder={priceNow ? fmtPrice(direction === "up" ? priceNow * 1.1 : priceNow * 0.9) : "0"}
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value.replace(/[^0-9.]/g, ""));
                    setPlan(null);
                  }}
                  className="w-full bg-transparent font-display text-3xl font-extrabold tracking-tight outline-none placeholder:text-muted/40"
                />
                {targetNum > 0 && priceNow && <span className={`shrink-0 text-sm font-semibold ${pct >= 0 ? "text-accent" : "text-negative"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {(direction === "up" ? [5, 10, 25, 50] : [-5, -10, -25, -40]).map((p) => (
                  <button key={p} onClick={() => preset(p)} className="rounded-full bg-surface-raised px-3 py-1 text-xs font-semibold text-muted hover:text-foreground">
                    {p > 0 ? "+" : ""}
                    {p}%
                  </button>
                ))}
              </div>
              {wrongWay && <p className="pt-2 text-xs text-negative">{direction === "up" ? "A sell target has to be above today's price." : "A buy target has to be below today's price."}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="pb-2 text-sm font-semibold">Rungs</p>
                <Select<number>
                  value={rungs}
                  onChange={(v) => {
                    setRungs(v);
                    setPlan(null);
                  }}
                  ariaLabel="Rungs"
                  align="left"
                  className="w-full"
                  options={Array.from({ length: MAX_RUNGS - MIN_RUNGS + 1 }, (_, i) => MIN_RUNGS + i).map((n) => ({
                    value: n,
                    label: `${n} rungs`,
                    hint: priceNow && targetNum ? `every ~$${fmtPrice(Math.abs(targetNum - priceNow) / n)}` : undefined,
                  }))}
                />
              </div>
              <div>
                <p className="pb-2 text-sm font-semibold">Give up after</p>
                <Select<string> value={expiry} onChange={setExpiry} ariaLabel="Expiry" align="left" className="w-full" options={EXPIRY.map((e) => ({ value: e.value, label: e.label }))} />
              </div>
            </div>

            <div>
              <p className="pb-2 text-sm font-semibold">How much?</p>
              <div className="flex items-baseline gap-2 rounded-2xl bg-surface-raised px-4 py-3">
                <span className="font-display text-2xl font-extrabold text-muted">$</span>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^0-9.]/g, ""));
                    setPlan(null);
                  }}
                  className="w-full bg-transparent font-display text-3xl font-extrabold tracking-tight outline-none placeholder:text-muted/40"
                />
                <button onClick={() => balance && setAmount(String(Math.floor(spendableUsd(market.chainId, balance.formatted) * 100) / 100))} className="rounded-full bg-surface px-3 py-1 text-xs text-muted hover:text-foreground">
                  Max
                </button>
              </div>
              <p className="pt-2 text-xs text-muted">
                {chain.quote.symbol} on {chain.label} · Minimum {fmtUsd(minDep)} · Available: {balance ? fmtUsd(balance.formatted) : "—"}
                {amountNum > 0 && ` · ${fmtUsd(amountNum / rungs)} per rung`}
              </p>
              {belowMin && <p className="pt-1 text-xs text-negative">Minimum is {fmtUsd(minDep)}.</p>}
              {insufficient && <p className="pt-1 text-xs text-negative">That&apos;s more than you have here.</p>}
            </div>

            <div className="rounded-2xl bg-surface-raised p-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={autoClose && canAutoClose}
                  disabled={!canAutoClose}
                  onChange={(e) => setAutoClose(e.target.checked)}
                  className="mt-1 accent-[var(--accent)] disabled:opacity-40"
                />
                <span className="text-sm">
                  <span className="block font-semibold">Close it for me when the target hits</span>
                  <span className="block pt-0.5 text-xs text-muted">
                    {!keeper
                      ? "Coming soon: until then we mark the target hit and you tap Close."
                      : canAutoClose
                        ? "vaults.cash closes the ladder from your wallet the moment the target prints, so a price that comes back down can't re-buy the asset."
                        : "Needs a one-time permission so vaults.cash can close the ladder from your wallet when the target prints. Without it we mark the target hit and you tap Close."}
                  </span>
                </span>
              </label>
              {keeper && !canAutoClose && (
                <div className="flex flex-wrap items-center gap-2 pt-2 pl-7">
                  <button
                    onClick={() => grant.mutate(undefined, { onSuccess: () => setAutoClose(true) })}
                    disabled={grant.isPending || !authenticated}
                    className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-black hover:bg-accent-strong disabled:opacity-50"
                  >
                    {grant.isPending ? "Waiting for Privy…" : "Turn it on now"}
                  </button>
                  <Link href="/account#agent-access" className="text-xs text-muted underline-offset-2 hover:underline">
                    What this permission is
                  </Link>
                  {grant.isError && <span className="text-xs text-negative">{(grant.error as Error).message}</span>}
                </div>
              )}
            </div>

            <button
              disabled={!canReview || planMutation.isPending}
              onClick={() => planMutation.mutate({ market, amountUsd: amountNum, direction, targetPriceUsd: rawTarget, rungs, slippageBps: 100 }, { onSuccess: setPlan })}
              className="w-full rounded-full bg-accent py-3.5 font-display text-base font-extrabold text-black hover:bg-accent-strong disabled:opacity-50"
            >
              {planMutation.isPending ? "Building your ladder…" : "Review target"}
            </button>
            {planMutation.isError && <p className="text-xs text-negative">{(planMutation.error as Error).message}</p>}
          </section>

          <aside className="rounded-3xl bg-surface p-5 shadow-card">
            <p className="font-display text-lg font-extrabold">How this works</p>
            <ol className="mt-3 space-y-3 text-sm text-muted">
              <li>
                <span className="font-semibold text-foreground">{direction === "up" ? "You hold the asset." : "You hold dollars."}</span>{" "}
                {direction === "up"
                  ? `Your ${chain.quote.symbol} buys ${market.base.symbol} today and parks it in ${rungs} narrow positions between here and your target.`
                  : `Your ${chain.quote.symbol} sits in ${rungs} narrow positions between here and your target.`}
              </li>
              <li>
                <span className="font-semibold text-foreground">Every rung earns.</span> Price passing through a rung {direction === "up" ? "sells" : "buys"} that slice and pays you {market.pool.fee / 10_000}% of every trade that crosses it.
              </li>
              <li>
                <span className="font-semibold text-foreground">If it never gets there,</span>{" "}
                {direction === "up" ? `you simply hold ${market.base.symbol}, like buying it outright.` : "your dollars sat there earning on any trade that dipped into a rung."}
              </li>
              <li>
                <span className="font-semibold text-foreground">Fees:</span> 0.6% in and 0.6% out, like Pools, plus an 8% performance fee: our share of the trading fees the ladder earns for you, for watching it and closing it at the target. It never touches what you put in, and it&apos;s taken only when you collect or close. Nothing else.
              </li>
            </ol>
          </aside>
        </div>
      </div>

      {plan && (
        <Sheet open onClose={() => !sendMutation.isPending && setPlan(null)} title="Review target" busy={sendMutation.isPending}>
          <p className="pt-1 font-display text-3xl font-extrabold tracking-tight">
            {market.base.symbol} {direction === "up" ? "→" : "↓"} ${fmtPrice(targetNum)}
          </p>
          <p className="text-sm text-muted">
            now ${fmtPrice(priceNow ?? 0)} · {plan.rungs.length} rungs · {fmtUsd(amountNum)} {chain.quote.symbol}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{direction === "up" ? "You hold today" : "Dollars on the ladder"}</dt>
              <dd className="font-medium">{direction === "up" ? `${plan.baseHeld.toFixed(4)} ${market.base.symbol}` : fmtUsd(plan.investedUsd)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">If it hits ${fmtPrice(targetNum)}</dt>
              <dd className="font-medium">{direction === "up" ? `${fmtUsd(plan.ifHitUsd)} ${chain.quote.symbol} + fees` : `${(plan.ifHitUsd / targetNum).toFixed(4)} ${market.base.symbol} + fees`}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">vaults.cash fee (0.6%)</dt>
              <dd className="font-medium">{fmtUsd(Number(plan.feeAmount) / 10 ** chain.quote.decimals)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Gas (network fee)</dt>
              <dd className="font-medium">
                <GasLine chainId={market.chainId as ChainId} calls={plan.calls} />
              </dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-1 text-xs">
            {[...plan.rungs].sort((a, b) => b.priceHigh - a.priceHigh).map((r) => (
              <li key={r.idx} className="flex justify-between rounded-lg bg-surface-raised px-3 py-1.5">
                <span className="font-mono">
                  ${fmtPrice(r.priceLow * (market.base.uiMultiplier || 1))} – ${fmtPrice(r.priceHigh * (market.base.uiMultiplier || 1))}
                </span>
                <span className="text-muted">
                  {fmtUsd(r.amountUsd)} → {fmtUsd(r.ifCrossedUsd)}
                </span>
              </li>
            ))}
          </ul>
          <p className="pt-3 text-xs text-muted">
            <GasNote chainId={market.chainId as ChainId} />
            Each rung is a narrow Uniswap position in your own wallet. {direction === "up" ? `If ${market.base.symbol} drops instead, you simply hold it.` : "If it never dips, your dollars sat there."}{" "}
            <Chip tone="outline">{plan.rungs.length} positions, one transaction</Chip>
          </p>
          {!authenticated ? (
            <button onClick={login} className="mt-4 w-full rounded-full bg-accent py-3.5 font-display text-base font-extrabold text-black">
              Log in to set this target
            </button>
          ) : (
            <button
              disabled={sendMutation.isPending}
              onClick={() =>
                sendMutation.mutate(
                  { plan, market, amountUsd: amountNum, autoClose: autoClose && canAutoClose, expiresAt: expiresAtNow() },
                  { onSuccess: ({ id }) => router.push(`/targets/${id}`) },
                )
              }
              className="mt-4 w-full rounded-full bg-accent py-3.5 font-display text-base font-extrabold text-black hover:bg-accent-strong disabled:opacity-50"
            >
              {sendMutation.isPending ? "Setting your target…" : "Set target"}
            </button>
          )}
          {sendMutation.isError && <p className="pt-2 text-xs text-negative">{(sendMutation.error as Error).message}</p>}
        </Sheet>
      )}
      {!ready && null}
    </AppShell>
  );
}
