"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { MarketingShell } from "@/components/MarketingShell";
import { ChainChip, Chip } from "@/components/TokenIcon";
import {
  MarketChart,
  TRADER_YS,
  HOLDER_YS,
  EARNER_YS,
  HERO_HOLD_YS,
  HERO_EARN_YS,
  HERO_TICKS,
} from "@/components/charts";
import type { MarketStats } from "@/app/api/stats/route";
import { fmtPct, fmtUsd } from "@/lib/format";

/* The vaults.cash cash-stack mark (from icon.svg), minus its dark tile, used
 * as a large watermark. */
function CashStack({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <g transform="rotate(-8 32 32)">
        <path d="M10 46c14 5 30 5 44 0v5c-14 5-30 5-44 0v-5Z" fill="#3e8f2b" opacity={0.55} />
        <path d="M10 38c14 5 30 5 44 0v5c-14 5-30 5-44 0v-5Z" fill="#54ad35" opacity={0.8} />
        <rect x="10" y="14" width="44" height="18" rx="4" fill="#7cd44a" />
        <rect x="16" y="18" width="32" height="10" rx="2" fill="#2f7a1e" />
        <rect x="27" y="19.5" width="10" height="7" rx="3" fill="#7cd44a" />
      </g>
    </svg>
  );
}

/* Base brandmark — backdrop for the "Built on Base" section, mirroring the
 * cash-stack on the opposite edge. */
function BaseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 111 111" fill="currentColor" className={className} aria-hidden>
      <path d="M54.921 110.034c30.438 0 55.117-24.632 55.117-55.017C110.038 24.632 85.359 0 54.921 0 26.041 0 2.353 22.171 0 50.392h72.847v9.25H0c2.353 28.222 26.04 50.392 54.921 50.392z" />
    </svg>
  );
}

/* Official Robinhood feather mark (the same asset we shipped in July's
 * "Built on Robinhood Chain" section), inlined so it inherits color/opacity.
 * Drawn in Robinhood's #00C805 so "their chain" reads distinct from our
 * accent green. */
function RobinhoodMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 598 800" fill="currentColor" className={className} aria-hidden>
      <path d="m250.85 627.43-5.28 1.78c-34.2 11.36-84.77 28.85-130.17 49.71-2.43 1.14-4.03 4.32-4.03 4.32-.84 1.95-1.89 4.35-3.08 7.07l-.18.35c-5.08 11.57-12.1 28.98-15.1 36.07l-2.34 5.58c-.36.88-.15 1.9.56 2.57.42.4.93.63 1.55.65.32 0 .7-.07 1.03-.24l5.49-2.61c12.41-5.9 28.14-14.86 44.63-22.69l.57-.27c31.35-14.87 66.74-31.65 88.06-41.81 0-.01 3.42-1.84 5.15-5.26l15.95-31.99c.42-.83.29-1.85-.29-2.56-.65-.7-1.63-.96-2.52-.67zm-127.46-49.58c2.22-4.37 12.59-24.26 14.93-28.72l.42-.76c69.24-130.58 153.63-253.74 250.77-366.06l2.69-3.1c.82-.97.97-2.36.38-3.49-.64-1.13-1.92-1.75-3.15-1.58l-4.07.55c-63.76 8.78-128.26 20.94-191.82 36.12-6.3 1.76-10.37 5.87-11.26 6.83-47.56 56.94-92.61 116.89-133.93 178.31-2.07 3.1-2.29 10.52-2.29 10.52s10.41 79.98 25.57 138.92c-37.57 108.01-71.11 250.35-71.11 250.35-.27.92-.08 1.91.47 2.69.57.78 1.47 1.23 2.44 1.26h21.38a3.17 3.17 0 0 0 3.02-2.03l1.45-4c21.83-59.51 46.73-118.29 74.23-175.55 6.4-13.34 19.88-40.26 19.88-40.26z" />
      <path d="m420.88 205.66-.04-4.07c-.04-1.28-.84-2.43-2.02-2.86-1.2-.45-2.58-.11-3.4.87l-2.66 3.08c-113.27 130.96-208.47 276.32-282.97 432.03l-1.73 3.64c-.57 1.15-.33 2.54.52 3.46.59.61 1.37.95 2.22.95.37.02.83-.06 1.22-.22l3.73-1.55c63.62-26.35 128.6-49.18 193.15-67.83 3.86-1.12 7.13-3.81 8.96-7.39 28.29-55.13 93.99-161.86 93.99-161.86 1.69-2.41 1.26-5.98 1.26-5.98s-11.51-127.67-12.23-192.27z" />
      <path d="m567.34 21.53c-16.08-13.94-39.4-20.49-75.66-21.27-32.87-.7-71.97 6.37-116.24 20.97-6.64 2.33-11.91 6-16.64 10.65a2138.718 2138.718 0 0 0 -130.22 133.41l-3.19 3.53c-.88 1-1.01 2.45-.36 3.6a3.07 3.07 0 0 0 3.33 1.47l4.64-.98c66.73-14.26 134.11-25.16 200.19-32.39 4.35-.48 8.84.97 12.09 3.93 3.24 2.99 5.1 7.24 5.02 11.67-1.09 65.57 1.28 131.47 7.13 195.89l.37 4.2a3.099 3.099 0 0 0 2.32 2.7c.22.06.44.11.73.12.98.01 2-.46 2.6-1.32l2.42-3.46c37.24-53.11 77.77-104.74 120.38-153.57l-.02-.01c4.77-5.43 6.04-8.87 6.93-13.8 13.42-85.84-7.29-149.28-25.82-165.34z" />
    </svg>
  );
}

/* ------------------------------------------------------------ calculator */

function EarningsCalculator() {
  const [amount, setAmount] = useState(1000);
  const { data: stats } = useQuery<Record<string, MarketStats>>({
    queryKey: ["stats"],
    queryFn: async () => (await fetch("/api/stats")).json(),
    staleTime: 60_000,
  });
  const eth = stats?.["base/eth-usdc"];
  const monthly = eth ? (amount * eth.estAprPct) / 100 / 12 : undefined;

  return (
    <div className="rounded-3xl border border-borderline bg-surface p-6 shadow-card sm:p-8">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-extrabold">If you put in</p>
        <Chip tone="accent">Live rate</Chip>
      </div>
      <div className="flex items-baseline gap-1 pt-1">
        <span className="font-display text-3xl font-extrabold text-muted">$</span>
        <input
          inputMode="numeric"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
          className="w-full bg-transparent font-display text-6xl font-extrabold tracking-tighter outline-none"
          aria-label="Deposit amount in dollars"
        />
      </div>
      <input
        type="range"
        min={100}
        max={10000}
        step={100}
        value={Math.min(amount, 10000)}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="mt-4 w-full accent-[var(--accent)]"
        aria-label="Deposit amount slider"
      />
      <div className="mt-6 rounded-2xl bg-surface-raised p-5">
        <p className="text-sm text-muted">could earn about</p>
        <p className="py-1 font-display text-4xl font-extrabold tracking-tight text-accent">
          {monthly !== undefined ? `${fmtUsd(monthly)} / month` : "…"}
        </p>
        <p className="text-xs leading-relaxed text-muted">
          at the ETH/USDC pool&apos;s recent activity
          {eth ? ` (${fmtPct(eth.estAprPct)} APR) ` : " "}— a live estimate from
          the last 24h of real trading, not a promise. Earnings vary with
          volume, and positions carry market &amp; impermanent-loss risk.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- landing */

export function Landing() {
  const { login } = useAuth();

  return (
    <MarketingShell>
      {/* hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute left-1/2 top-[-20%] h-[600px] w-[900px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 sm:pt-24 lg:grid-cols-2 lg:gap-16 lg:pb-28">
          <div className="flex flex-col items-start gap-6">
            <div className="flex flex-wrap gap-2">
              <Chip>Live now</Chip>
              <ChainChip chainId={8453} />
              <ChainChip chainId={4663} long />
            </div>
            <h1 className="text-balance font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
              Every trade pays a fee. Be the one{" "}
              <span className="text-accent">collecting it</span>.
            </h1>
            <p className="max-w-md text-balance text-lg text-muted">
              vaults.cash puts your cash on the earning side of the market:
              hold ETH, Bitcoin or tokenized stocks, and collect a slice of
              every trade — without trading.
            </p>
            <div className="flex items-center gap-5 pt-2">
              <button
                onClick={login}
                className="rounded-full bg-accent px-9 py-3.5 text-lg font-semibold text-black transition-colors hover:bg-accent-strong"
              >
                Get started
              </button>
              <Link
                href="/how-it-works"
                className="text-base font-semibold text-muted transition-colors hover:text-foreground"
              >
                How it works →
              </Link>
            </div>
          </div>

          {/* hero graphic: holding vs holding+fees */}
          <div className="rounded-3xl border border-borderline bg-surface/80 p-6 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex items-center justify-between pb-4">
              <p className="font-semibold">Your position</p>
              <span className="sticker inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs text-black">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />
                Earning
              </span>
            </div>
            <MarketChart
              series={[
                { ys: HERO_HOLD_YS, color: "var(--muted)", width: 1.5, dashed: true },
                { ys: HERO_EARN_YS, color: "var(--accent)", width: 2, fill: true, ticks: HERO_TICKS },
              ]}
            />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded bg-accent" /> Holding
                + fees collected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded bg-muted" /> Just
                holding
              </span>
              <span className="ml-auto text-muted/60">Illustrative</span>
            </div>
          </div>
        </div>
      </section>

      {/* why */}
      <section className="border-y border-borderline/60 bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <h2 className="max-w-2xl text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Between trading and holding, there&apos;s{" "}
            <span className="text-accent">earning</span>.
          </h2>
          <div className="grid gap-5 pt-10 md:grid-cols-3">
            <div className="tilt rounded-3xl border border-borderline bg-surface p-7 shadow-card">
              <MarketChart series={[{ ys: TRADER_YS, color: "var(--negative)", fill: true }]} />
              <div className="flex items-center gap-2 pt-5">
                <p className="font-display text-xl font-extrabold">Trading is hard</p>
                <Chip tone="negative">Most lose</Chip>
              </div>
              <p className="pt-2 text-sm leading-relaxed text-muted">
                Timing the market is a full-time job, and most people who try
                end up behind where simply holding would have left them.
              </p>
            </div>
            <div className="tilt rounded-3xl border border-borderline bg-surface p-7 shadow-card">
              <MarketChart domain={[88, 112]} series={[{ ys: HOLDER_YS, color: "var(--muted)" }]} />
              <div className="flex items-center gap-2 pt-5">
                <p className="font-display text-xl font-extrabold">Holding earns nothing</p>
                <Chip>$0 income</Chip>
              </div>
              <p className="pt-2 text-sm leading-relaxed text-muted">
                Holding is easier — but your assets just sit there. No income,
                no cashflow, nothing working for you.
              </p>
            </div>
            <div className="tilt rounded-3xl border border-accent/40 bg-surface p-7 shadow-card">
              <MarketChart
                series={[
                  { ys: HOLDER_YS, color: "var(--muted)", width: 1.25, dashed: true },
                  { ys: EARNER_YS, color: "var(--accent)", fill: true, ticks: [12, 26, 40, 52] },
                ]}
              />
              <div className="flex items-center gap-2 pt-5">
                <p className="font-display text-xl font-extrabold text-accent">Hold — and collect</p>
                <Chip tone="accent">Earning</Chip>
              </div>
              <p className="pt-2 text-sm leading-relaxed text-muted">
                Your assets sit in a market position that traders trade
                against. You keep holding; every trade pays you a fee — in
                ETH, USDC, or stock tokens.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* calculator */}
      <section className="relative isolate overflow-hidden">
        <CashStack className="pointer-events-none absolute -left-16 top-4 -z-10 h-[340px] w-[340px] opacity-[0.15] sm:opacity-[0.18] lg:-left-20 lg:top-1/2 lg:h-[520px] lg:w-[520px] lg:-translate-y-1/2" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              What could that earn?
            </h2>
            <p className="max-w-md pt-4 text-lg leading-relaxed text-muted">
              Liquidity positions earn a share of the fee on every trade in their
              pool. This is the live rate from real trading over the last 24
              hours — not a projection we made up.
            </p>
            <button
              onClick={login}
              className="mt-7 rounded-full bg-accent px-8 py-3 font-semibold text-black transition-colors hover:bg-accent-strong"
            >
              Start earning
            </button>
          </div>
          <EarningsCalculator />
        </div>
      </section>

      {/* how */}
      <section className="border-y border-borderline/60 bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Three taps, no jargon
          </h2>
          <div className="grid gap-5 pt-10 md:grid-cols-3">
            {[
              {
                n: "1",
                t: "Log in with email",
                d: "A secure wallet is created for you. No seed phrases, nothing to install.",
              },
              {
                n: "2",
                t: "Pick a pool, deposit cash",
                d: "One tap turns USDC into an earning position — atomically, all or nothing.",
              },
              {
                n: "3",
                t: "Collect as you hold",
                d: "Trading fees accrue to your position. Withdraw back to cash anytime.",
              },
            ].map((s) => (
              <div key={s.n} className="tilt rounded-3xl border border-borderline bg-surface p-7 shadow-card">
                <span className="sticker flex h-10 w-10 items-center justify-center rounded-full bg-accent text-base text-black">
                  {s.n}
                </span>
                <p className="pt-4 font-display text-xl font-extrabold">{s.t}</p>
                <p className="pt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              </div>
            ))}
          </div>
          <p className="pt-8">
            <Link
              href="/how-it-works"
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              See exactly what happens to your money →
            </Link>
          </p>
        </div>
      </section>

      {/* chain */}
      <section className="relative isolate overflow-hidden">
        <RobinhoodMark className="pointer-events-none absolute -left-12 -top-10 -z-10 h-[380px] w-[284px] text-[#00C805] opacity-[0.16] sm:-left-8 sm:-top-6 sm:h-[620px] sm:w-[464px] sm:opacity-20" />
        <BaseMark className="pointer-events-none absolute -right-16 -top-16 -z-10 h-[380px] w-[380px] text-[#0052ff] opacity-[0.16] sm:-right-12 sm:h-[620px] sm:w-[620px] sm:opacity-20" />
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Built on Base and Robinhood Chain
          </h2>
          <p className="max-w-2xl pt-4 text-lg leading-relaxed text-muted">
            Base is Coinbase&apos;s Ethereum layer-2 — one of the most active
            chains in crypto, with billions in real trading. Robinhood Chain
            brings tokenized stocks and ETFs on-chain, trading around the clock.
            One wallet, one address, both chains. That depth is what makes the
            fees worth collecting:
          </p>
          <ul className="grid gap-5 pt-10 md:grid-cols-3">
            {[
              ["Markets never close", "Crypto and stock tokens trade around the clock — your position earns while you sleep, weekends included.", "24/7"],
              ["Real depth", "ETH, Bitcoin, blue-chip DeFi and Robinhood stock tokens, with the trading volume to actually generate fees.", "Billions traded"],
              ["Fully public", "Every position, fee, and trade is verifiable on the public explorers. Nothing happens behind a curtain.", "On-chain"],
            ].map(([t, d, tag]) => (
              <li key={t} className="tilt rounded-3xl border border-borderline bg-surface p-7 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-xl font-extrabold">{t}</p>
                  <Chip>{tag}</Chip>
                </div>
                <p className="pt-2 text-sm leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ul>
          <p className="pt-6 text-xs text-muted/70">
            vaults.cash is an independent app built on Base and Robinhood Chain.
            It is not affiliated with, endorsed by, or sponsored by Coinbase,
            Robinhood, or Uniswap Labs.
          </p>
        </div>
      </section>

      {/* final CTA */}
      <section className="border-t border-borderline/60 bg-surface/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-7 px-6 py-20 text-center sm:py-24">
          <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            Put your cash on the <span className="text-accent">earning side</span>.
          </h2>
          <ul className="flex flex-wrap justify-center gap-2.5">
            {[
              ["accent", "Self-custodial"],
              ["muted", "Official Uniswap v4 pools"],
              ["muted", "One flat 0.6% fee"],
              ["outline", "Nothing hidden"],
            ].map(([tone, line]) => (
              <li key={line}>
                <Chip tone={tone as "accent" | "muted" | "outline"}>{line}</Chip>
              </li>
            ))}
          </ul>
          <button
            onClick={login}
            className="rounded-full bg-accent px-10 py-4 text-lg font-semibold text-black transition-colors hover:bg-accent-strong"
          >
            Start earning
          </button>
          <p className="text-xs text-muted">
            Liquidity positions carry market &amp; impermanent-loss risk. Not
            available in all regions.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
