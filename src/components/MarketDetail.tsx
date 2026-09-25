"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useMarketQuote, useQuoteBalance, useTokenBalance } from "@/hooks/useChainData";
import { NATIVE_ETH, marketBySlug, sharePrice, type Market } from "@/lib/markets";
import { usePlanDeposit, useSendDeposit } from "@/hooks/useDeposit";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { CHAINS, chainConfig } from "@/lib/chain";
import { planSummary, presetTicks, PRESET_WIDTH, type RangePreset, type ZapPlan } from "@/lib/zap";
import { tickToPrice } from "@/lib/onchain";
import { MarketChips, PairIcons } from "./TokenIcon";
import { describeCalls } from "@/lib/describeCalls";
import { Sheet } from "./Sheet";
import { useAuth } from "./AuthProvider";
import { Select } from "./Select";
import { SigningSteps } from "./SigningSteps";
import { MIN_DEPOSIT_USD, poolIdle } from "@/lib/limits";
import { RangeBar } from "./RangeBar";
import { useStats } from "./PoolList";

const PRESETS: Array<{ id: RangePreset; label: string; blurb: string }> = [
  { id: "full", label: "Set & forget", blurb: "Earns at any price. Never needs attention." },
  { id: "balanced", label: "Balanced", blurb: "Earns while price stays within ±30%." },
  { id: "aggressive", label: "Aggressive", blurb: "Highest rate, narrow ±15% band." },
];

export function MarketDetail({ slug }: { slug: string }) {
  const market = marketBySlug(slug)!;
  const chain = chainConfig(market.chainId);
  const stable = CHAINS[market.chainId].quote;
  const router = useRouter();
  const { authenticated, login } = useAuth();
  const { data: quote } = useMarketQuote(market);
  const { data: stats } = useStats();
  const { data: balance } = useQuoteBalance(market.chainId);

  const [amount, setAmount] = useState("");
  const [preset, setPreset] = useState<RangePreset>("full");
  const [advanced, setAdvanced] = useState(false);
  const [customWidthPct, setCustomWidthPct] = useState<string>("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [plan, setPlan] = useState<ZapPlan | null>(null);

  const planMutation = usePlanDeposit();
  const sendMutation = useSendDeposit();

  const { data: ethBalance } = useTokenBalance(NATIVE_ETH, 18, market.chainId);

  const s = stats?.[market.slug];
  const amountNum = Number(amount) || 0;
  const insufficient = balance !== undefined && amountNum > (balance?.formatted ?? 0);
  const belowMin = amountNum > 0 && amountNum < MIN_DEPOSIT_USD;
  const idle = poolIdle(s);
  const tooThin = s !== undefined && s.tvlUsd > 0 && amountNum > s.tvlUsd * 0.1;
  const noGas = ethBalance !== undefined && ethBalance.raw === 0n;
  const customWidth = advanced && customWidthPct ? Number(customWidthPct) / 100 : undefined;

  // the range the chosen preset would give right now, in dollars
  const range =
    quote &&
    (() => {
      const { tickLower, tickUpper } = presetTicks(market, quote.tick, preset, customWidth);
      const lo = tickToPrice(market, tickLower) * quote.quoteUsd;
      const hi = tickToPrice(market, tickUpper) * quote.quoteUsd;
      return { lower: sharePrice(market, Math.min(lo, hi)), upper: sharePrice(market, Math.max(lo, hi)) };
    })();

  const buildPlan = async () => {
    // the mutation's own error state renders below the button; don't let the
    // rejection escape as an uncaught promise
    const p = await planMutation.mutateAsync({ market, amountUsd: amountNum, preset, customWidth, slippageBps }).catch(() => null);
    if (p) setPlan(p);
  };

  const confirm = async () => {
    if (!plan) return;
    await sendMutation.mutateAsync(plan);
    router.push("/portfolio?deposited=1");
  };

  const summary = plan ? planSummary(plan, market) : null;
  const priceUsd = quote ? sharePrice(market, quote.priceUsd) : undefined;

  return (
    <AppShell>
      <div className="animate-rise space-y-5 py-4">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← All pools
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <PairIcons market={market} size={44} />
            <div>
              <h1 className="text-2xl font-bold leading-tight">
                {market.base.symbol} <span className="text-muted">/</span> {market.quote.symbol}
              </h1>
              <p className="pt-0.5 text-sm text-muted">
                {market.base.name} · {market.quote.name}
              </p>
              <div className="pt-1.5">
                <MarketChips market={market} stats={s} />
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tracking-tight">{priceUsd !== undefined ? `$${fmtPrice(priceUsd)}` : "—"}</p>
            <p className="text-xs text-muted">
              {market.quoteIsStable
                ? `1 ${market.base.symbol}`
                : quote
                  ? `1 ${market.base.symbol} = ${fmtPrice(sharePrice(market, quote.price))} ${market.quote.symbol}`
                  : ""}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Liquidity" value={s ? fmtUsd(s.tvlUsd, { compact: true }) : "—"} />
          <Stat label="24h volume" value={s ? fmtUsd(s.vol24hUsd, { compact: true }) : "—"} />
          <Stat label="24h fees to LPs" value={s ? fmtUsd(s.fees24hUsd, { compact: true }) : "—"} />
          <Stat label="Est. APR" value={s ? fmtPct(s.estAprPct) : "—"} accent />
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <section className="rounded-3xl bg-surface shadow-card p-5">
            <label className="text-sm text-muted" htmlFor="amount">
              Deposit {stable.symbol}
            </label>
            <div className="flex items-baseline gap-2 py-1">
              <span className="text-3xl font-bold">$</span>
              <input
                id="amount"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-full bg-transparent text-3xl font-bold outline-none placeholder:text-muted/40"
              />
              <button
                onClick={() => balance && setAmount(String(Math.floor(balance.formatted * 100) / 100))}
                className="rounded-full bg-surface-raised px-3 py-1 text-xs text-muted hover:text-foreground"
              >
                Max
              </button>
            </div>
            <p className="pb-4 text-xs text-muted">
              Minimum {fmtUsd(MIN_DEPOSIT_USD)} · Available: {balance ? fmtUsd(balance.formatted) : "—"}
            </p>

            <p className="pb-2 text-sm font-semibold">Price range</p>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={`rounded-2xl border p-3 text-left transition-colors ${
                    preset === p.id ? "border-accent bg-accent/10" : "border-borderline bg-surface-raised hover:border-muted"
                  }`}
                >
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="block pt-0.5 text-[11px] leading-snug text-muted">{p.blurb}</span>
                </button>
              ))}
            </div>
            <div className="pt-4">
              {quote && range && priceUsd !== undefined ? (
                <RangeBar price={priceUsd} lower={range.lower} upper={range.upper} />
              ) : (
                <div className="h-10 animate-pulse rounded-full bg-surface-raised" />
              )}
            </div>

            <button onClick={() => setAdvanced(!advanced)} className="mt-3 text-xs text-muted underline-offset-2 hover:underline">
              {advanced ? "Hide advanced" : "Advanced"}
            </button>
            {advanced && (
              <div className="mt-2 grid grid-cols-2 gap-3 rounded-2xl bg-surface-raised p-3 text-sm">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Range width (±%)
                  <input
                    inputMode="decimal"
                    placeholder={preset === "full" ? "full range" : String(PRESET_WIDTH[preset] * 100)}
                    value={customWidthPct}
                    onChange={(e) => setCustomWidthPct(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="rounded-lg bg-background p-2 text-foreground outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Max slippage
                  <Select
                    value={slippageBps}
                    onChange={setSlippageBps}
                    ariaLabel="Max slippage"
                    align="left"
                    options={[
                      { value: 50, label: "0.5%" },
                      { value: 100, label: "1%" },
                      { value: 300, label: "3%" },
                    ]}
                  />
                </label>
              </div>
            )}

            {!chain.gasSponsored && noGas && amountNum > 0 && (
              <p className="mt-3 text-xs text-negative">
                Your wallet has no ETH on {chain.label} for network fees. Send a small amount of ETH on{" "}
                {chain.chain.name} (about $1 covers many transactions) — see Add funds on the home screen.
              </p>
            )}
            {idle && (
              <p className="mt-3 text-xs text-negative">
                {s && s.vol24hUsd > 0 ? `Only ${fmtUsd(s.vol24hUsd)} traded` : "Nobody has traded"} in this pool in the last 24
                hours, so right now it earns next to nothing. It still holds{" "}
                {s ? fmtUsd(s.tvlUsd, { compact: true }) : "plenty"} of liquidity — a busier pool will pay more.
              </p>
            )}
            {tooThin && (
              <p className="mt-3 text-xs text-negative">
                This pool is still small — a deposit this size may move the price. Consider{" "}
                {s ? fmtUsd(s.tvlUsd * 0.05, { compact: true }) : "less"} or less.
              </p>
            )}

            <button
              disabled={authenticated && (amountNum <= 0 || belowMin || insufficient || planMutation.isPending)}
              onClick={authenticated ? buildPlan : login}
              className="mt-4 w-full rounded-full bg-accent py-3 font-semibold text-black transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {!authenticated
                ? "Log in to deposit"
                : insufficient
                  ? `Insufficient ${stable.symbol}`
                  : belowMin
                    ? `Minimum ${fmtUsd(MIN_DEPOSIT_USD)}`
                    : planMutation.isPending ? "Getting quote…" : "Review deposit"}
            </button>
            {planMutation.isError && (
              <p className="mt-2 text-xs text-negative">
                Couldn&apos;t build this deposit: {(planMutation.error as Error).message}
              </p>
            )}
          </section>

          <HowItWorks market={market} />
        </div>
      </div>

      {plan && summary && (
        <Sheet open onClose={() => setPlan(null)} title="Confirm deposit" busy={sendMutation.isPending}>
            <dl className="space-y-2 py-4 text-sm">
              <Row k={`${market.base.symbol} side`} v={`~${fmtUsd(summary.baseUsd)}`} />
              <Row k={`${market.quote.symbol} side`} v={`~${fmtUsd(summary.quoteUsd)}`} />
              <Row k={`vaults.cash fee (${Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100}%)`} v={fmtUsd(summary.feeUsd)} />
              <Row
                k="Range"
                v={
                  preset === "full" && !customWidthPct
                    ? "Any price"
                    : range
                      ? `$${fmtPrice(range.lower)} – $${fmtPrice(range.upper)}`
                      : `±${customWidthPct || (preset !== "full" ? PRESET_WIDTH[preset] * 100 : "")}%`
                }
              />
            </dl>
            <p className="pb-2 text-xs text-muted">
              {plan.quoteLeg && `Your ${stable.symbol} is converted to ${market.quote.symbol} first. `}
              {chain.gasSponsored ? "Network fees are covered by vaults.cash." : "Network fee well under a cent, paid in ETH from your wallet."}{" "}
              You&apos;ll earn {market.pool.fee / 10_000}% of every trade that crosses your range. Withdraw anytime.{" "}
              <Link href="/trust" className="underline underline-offset-2">
                What vaults.cash can and can&apos;t do
              </Link>
              .
            </p>
            <SigningSteps steps={describeCalls(plan, market)} />
            <button
              onClick={confirm}
              disabled={sendMutation.isPending}
              className="w-full rounded-full bg-accent py-3 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
            >
              {sendMutation.isPending ? "Depositing…" : "Deposit"}
            </button>
            {sendMutation.isError && <p className="mt-2 text-xs text-negative">{(sendMutation.error as Error).message}</p>}
        </Sheet>
      )}
    </AppShell>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface px-4 py-3 shadow-card">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`pt-0.5 text-lg font-semibold ${accent ? "text-accent" : ""}`}>{value}</p>
    </div>
  );
}

/** Plain-words explainer tailored to the pair. */
function HowItWorks({ market }: { market: Market }) {
  const b = market.base.symbol;
  const q = market.quote.symbol;
  const risk = market.lowIl
    ? `${b} and ${q} track the same thing, so price swings barely change what you hold. This is the closest an LP position gets to "just earning fees".`
    : market.kind === "stock"
      ? `The stock token follows its share price. If it moves outside your range you hold mostly one side and stop earning until it comes back — or you withdraw and re-enter.`
      : `If ${b} moves a lot against ${q}, you end up holding more of the one that fell. Wider ranges soften this; "Set & forget" never goes out of range.`;
  return (
    <section className="space-y-4 rounded-3xl bg-surface shadow-card p-5 text-sm">
      <h2 className="font-semibold">How this pool works</h2>
      <Step n={1} title={`You hold ${b} and ${q}`}>
        Your deposit is split into both, matched to your price range, and placed in the official Uniswap pool. It stays in your own wallet as a position you can withdraw any time.
      </Step>
      <Step n={2} title={`Traders pay you ${market.pool.fee / 10_000}% per trade`}>
        Every swap through this pool while the price is inside your range pays a fee, shared among everyone providing liquidity in that range. Narrower ranges earn a bigger share.
      </Step>
      <Step n={3} title="What can go wrong">{risk}</Step>
      <p className="text-xs text-muted">
        Not a deposit account, not insured. Read the{" "}
        <Link href="/disclosures" className="underline underline-offset-2">
          disclosures
        </Link>
        .
      </p>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{n}</span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="pt-0.5 text-muted">{children}</p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
