"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useMarketQuote, useQuoteBalance, useTokenBalance } from "@/hooks/useChainData";
import { NATIVE_ETH, type Market } from "@/lib/markets";
import { usePlanDeposit, useSendDeposit } from "@/hooks/useDeposit";
import { formatEther } from "viem";
import { fmtUsd, fmtPct } from "@/lib/format";
import { chainConfig } from "@/lib/chain";
import { marketBySymbol } from "@/lib/markets";
import { PERMIT2, contractsOf } from "@/lib/uniswap";
import { planSummary, PRESET_WIDTH, type RangePreset, type ZapPlan } from "@/lib/zap";
import type { MarketStats } from "@/app/api/stats/route";

const PRESETS: Array<{ id: RangePreset; label: string; blurb: string }> = [
  { id: "full", label: "Set & forget", blurb: "Earns at any price. Never needs attention." },
  { id: "balanced", label: "Balanced", blurb: "Earns while price stays within ±30%." },
  { id: "aggressive", label: "Aggressive", blurb: "Highest rate, narrow ±15% band." },
];

function useStats() {
  return useQuery<Record<string, MarketStats>>({
    queryKey: ["stats"],
    queryFn: async () => (await fetch("/api/stats")).json(),
    staleTime: 60_000,
  });
}

export function MarketDetail({ symbol }: { symbol: string }) {
  const market = marketBySymbol(symbol)!;
  const chain = chainConfig(market.chainId);
  const router = useRouter();
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
  const tooThin = s !== undefined && s.tvlUsd > 0 && amountNum > s.tvlUsd * 0.1;
  const noGas = ethBalance !== undefined && ethBalance.raw === 0n;

  const buildPlan = async () => {
    const p = await planMutation.mutateAsync({
      market,
      amountUsd: amountNum,
      preset,
      customWidth: advanced && customWidthPct ? Number(customWidthPct) / 100 : undefined,
      slippageBps,
    });
    setPlan(p);
  };

  const confirm = async () => {
    if (!plan) return;
    await sendMutation.mutateAsync(plan);
    router.push("/portfolio?deposited=1");
  };

  const summary =
    plan && quote
      ? planSummary(plan, quote.price, market.tokenDecimals, market.quote.decimals)
      : null;

  return (
    <AppShell>
      <div className="animate-rise space-y-6 py-4">
        <header>
          <p className="text-sm text-muted">
            {market.name}
            {market.kind === "stable" && " · Stablecoin"}
            {" · "}
            {chain.label}
          </p>
          <p className="text-4xl font-bold tracking-tight">
            {quote ? fmtUsd(quote.price) : "—"}
          </p>
          <div className="mt-2 flex gap-4 text-sm text-muted">
            <span>Pool {market.pool.fee / 10_000}%</span>
            <span>TVL {s ? fmtUsd(s.tvlUsd, { compact: true }) : "—"}</span>
            <span>24h vol {s ? fmtUsd(s.vol24hUsd, { compact: true }) : "—"}</span>
            <span className="text-accent">
              Est. {s ? fmtPct(s.estAprPct) : "—"} APR
            </span>
          </div>
        </header>

        <section className="rounded-3xl bg-surface p-5">
          <label className="text-sm text-muted" htmlFor="amount">
            Deposit {market.quote.symbol}
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
            Available: {balance ? fmtUsd(balance.formatted) : "—"}
          </p>

          <div className="space-y-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                  preset === p.id
                    ? "border-accent bg-accent/10"
                    : "border-borderline bg-surface-raised hover:border-muted"
                }`}
              >
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block text-xs text-muted">{p.blurb}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setAdvanced(!advanced)}
            className="mt-3 text-xs text-muted underline-offset-2 hover:underline"
          >
            {advanced ? "Hide advanced" : "Advanced"}
          </button>
          {advanced && (
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-2xl bg-surface-raised p-3 text-sm">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Range width (±%)
                <input
                  inputMode="decimal"
                  placeholder={
                    preset === "full" ? "full range" : String(PRESET_WIDTH[preset] * 100)
                  }
                  value={customWidthPct}
                  onChange={(e) => setCustomWidthPct(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="rounded-lg bg-background p-2 text-foreground outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Max slippage
                <select
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(Number(e.target.value))}
                  className="rounded-lg bg-background p-2 text-foreground outline-none"
                >
                  <option value={50}>0.5%</option>
                  <option value={100}>1%</option>
                  <option value={300}>3%</option>
                </select>
              </label>
            </div>
          )}

          {!chain.gasSponsored && noGas && amountNum > 0 && (
            <p className="mt-3 text-xs text-negative">
              Your wallet has no ETH on {chain.label} for network fees. Send a
              small amount of ETH on {chain.chain.name} (about $1 covers many
              transactions) — see Receive on the home screen.
            </p>
          )}
          {tooThin && (
            <p className="mt-3 text-xs text-negative">
              This market is still small — a deposit this size may move the
              price. Consider {s ? fmtUsd(s.tvlUsd * 0.05, { compact: true }) : "less"} or
              less.
            </p>
          )}

          <button
            disabled={amountNum <= 0 || insufficient || planMutation.isPending}
            onClick={buildPlan}
            className="mt-4 w-full rounded-full bg-accent py-3 font-semibold text-black transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            {insufficient
              ? `Insufficient ${market.quote.symbol}`
              : planMutation.isPending
                ? "Getting quote…"
                : "Review deposit"}
          </button>
          {planMutation.isError && (
            <p className="mt-2 text-xs text-negative">
              Couldn&apos;t build this deposit: {(planMutation.error as Error).message}
            </p>
          )}
        </section>
      </div>

      {plan && summary && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={() => !sendMutation.isPending && setPlan(null)}
        >
          <div
            className="w-full max-w-md animate-rise rounded-t-3xl bg-surface-raised p-6 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Confirm deposit</h3>
            <dl className="space-y-2 py-4 text-sm">
              <Row k={`${market.symbol} side`} v={`~${fmtUsd(summary.assetUsd)}`} />
              <Row k={`${market.quote.symbol} side`} v={fmtUsd(summary.usdcUsd)} />
              <Row k={`vaults.cash fee (${Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100}%)`} v={fmtUsd(summary.feeUsd)} />
              <Row
                k="Range"
                v={preset === "full" && !customWidthPct ? "Full range" : `±${customWidthPct || (preset !== "full" ? PRESET_WIDTH[preset] * 100 : "")}%`}
              />
            </dl>
            <p className="pb-2 text-xs text-muted">
              {chain.gasSponsored
                ? "Network fees are covered by vaults.cash."
                : "Network fee ~$0.01, paid in ETH from your wallet."}{" "}
              You&apos;ll earn {market.pool.fee / 10_000}% of every trade that
              crosses your range. Withdraw anytime.
            </p>
            <TxDetails market={market} calls={plan.calls} />
            <button
              onClick={confirm}
              disabled={sendMutation.isPending}
              className="w-full rounded-full bg-accent py-3 font-semibold text-black hover:bg-accent-strong disabled:opacity-40"
            >
              {sendMutation.isPending ? "Depositing…" : "Deposit"}
            </button>
            {sendMutation.isError && (
              <p className="mt-2 text-xs text-negative">
                {(sendMutation.error as Error).message}
              </p>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function contractLabels(market: Market): Record<string, string> {
  const { router, posm } = contractsOf(market);
  return {
    [market.quote.address.toLowerCase()]: `${market.quote.symbol} token`,
    [PERMIT2.toLowerCase()]: "Permit2 (approvals)",
    [router.toLowerCase()]: "Uniswap Universal Router (swap)",
    [posm.toLowerCase()]: "Uniswap Position Manager (mint)",
  };
}

function TxDetails({ market, calls }: { market: Market; calls: ZapPlan["calls"] }) {
  const CONTRACT_LABELS = contractLabels(market);
  return (
    <details className="pb-4 text-xs text-muted">
      <summary className="cursor-pointer underline-offset-2 hover:underline">
        Transaction details (advanced)
      </summary>
      <div className="mt-2 max-h-44 space-y-2 overflow-y-auto rounded-xl bg-background p-3 font-mono">
        {calls.map((c, i) => (
          <div key={i}>
            <p className="text-foreground">
              {i + 1}. {CONTRACT_LABELS[c.to.toLowerCase()] ?? c.to}
              {c.value > 0n ? ` · ${formatEther(c.value)} ETH` : ""}
            </p>
            <p className="break-all text-muted/60">{c.data}</p>
          </div>
        ))}
        <p className="pt-1 text-muted/60">
          Executed atomically from your wallet via EIP-7702 + ERC-4337
          (EntryPoint v0.8). All-or-nothing: if any step fails, everything
          reverts.
        </p>
      </div>
    </details>
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
