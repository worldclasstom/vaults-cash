"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { Wordmark } from "@/components/Logo";
import { FooterContent } from "@/components/Footer";
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

/* ------------------------------------------------------------ calculator */

function EarningsCalculator() {
  const [amount, setAmount] = useState(1000);
  const { data: stats } = useQuery<Record<string, MarketStats>>({
    queryKey: ["stats"],
    queryFn: async () => (await fetch("/api/stats")).json(),
    staleTime: 60_000,
  });
  const eth = stats?.ETH;
  const monthly = eth ? (amount * eth.estAprPct) / 100 / 12 : undefined;

  return (
    <div className="rounded-3xl border border-borderline bg-surface p-6 sm:p-8">
      <p className="text-sm font-semibold">If you put in</p>
      <div className="flex items-baseline gap-1 pt-1">
        <span className="text-3xl font-bold text-muted">$</span>
        <input
          inputMode="numeric"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
          className="w-full bg-transparent text-5xl font-bold tracking-tight outline-none"
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
        <p className="py-1 text-4xl font-bold text-accent">
          {monthly !== undefined ? `${fmtUsd(monthly)} / month` : "…"}
        </p>
        <p className="text-xs leading-relaxed text-muted">
          at the ETH/USDG pool&apos;s recent activity
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
  const { login } = usePrivy();

  return (
    <div className="w-full">
      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-borderline/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark />
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/how-it-works"
              className="hidden text-sm font-medium text-muted transition-colors hover:text-foreground sm:block"
            >
              How it works
            </Link>
            <button
              onClick={login}
              className="rounded-full border border-borderline px-5 py-2 text-sm font-semibold transition-colors hover:border-muted"
            >
              Log in
            </button>
            <button
              onClick={login}
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong"
            >
              Get started
            </button>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute left-1/2 top-[-20%] h-[600px] w-[900px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 sm:pt-24 lg:grid-cols-2 lg:gap-16 lg:pb-28">
          <div className="flex flex-col items-start gap-6">
            <p className="rounded-full bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent">
              Now live on Robinhood Chain
            </p>
            <h1 className="text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl xl:text-7xl">
              Every trade pays a fee. Be the one{" "}
              <span className="text-accent">collecting it</span>.
            </h1>
            <p className="max-w-md text-balance text-lg text-muted">
              vaults.cash puts your cash on the earning side of the market:
              hold blue-chip crypto and tokenized stocks, and collect a slice
              of every trade — without trading.
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
              <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Earning
              </span>
            </div>
            <MarketChart
              height={230}
              series={[
                { ys: HERO_HOLD_YS, color: "var(--muted)", width: 2, dashed: true },
                { ys: HERO_EARN_YS, color: "var(--accent)", width: 2.5, fill: true, ticks: HERO_TICKS },
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
          <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            The middle ground the market forgot
          </h2>
          <div className="grid gap-5 pt-10 md:grid-cols-3">
            <div className="rounded-3xl border border-borderline bg-surface p-7">
              <MarketChart height={120} series={[{ ys: TRADER_YS, color: "var(--negative)", fill: true }]} />
              <p className="pt-5 text-lg font-semibold">Trading is hard</p>
              <p className="pt-2 text-sm leading-relaxed text-muted">
                Timing the market is a full-time job, and most people who try
                end up behind where simply holding would have left them.
              </p>
            </div>
            <div className="rounded-3xl border border-borderline bg-surface p-7">
              <MarketChart height={120} domain={[88, 112]} series={[{ ys: HOLDER_YS, color: "var(--muted)" }]} />
              <p className="pt-5 text-lg font-semibold">Holding earns nothing</p>
              <p className="pt-2 text-sm leading-relaxed text-muted">
                Holding is easier — but your assets just sit there. No income,
                no cashflow, nothing working for you.
              </p>
            </div>
            <div className="rounded-3xl border border-accent/40 bg-surface p-7">
              <MarketChart
                height={120}
                series={[
                  { ys: HOLDER_YS, color: "var(--muted)", width: 1.5, dashed: true },
                  { ys: EARNER_YS, color: "var(--accent)", fill: true, ticks: [8, 16, 24, 30] },
                ]}
              />
              <p className="pt-5 text-lg font-semibold text-accent">Hold — and collect</p>
              <p className="pt-2 text-sm leading-relaxed text-muted">
                Your assets sit in a market position that traders trade
                against. You keep holding; every trade pays you a fee — in
                ETH, USDG, or stock tokens.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* calculator */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            What could that earn?
          </h2>
          <p className="max-w-md pt-4 text-lg leading-relaxed text-muted">
            Liquidity positions earn a share of the fee on every trade in their
            pool. This is the live rate from real trading over the last 24
            hours — not a projection we made up.
          </p>
        </div>
        <EarningsCalculator />
      </section>

      {/* how */}
      <section className="border-y border-borderline/60 bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
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
                t: "Pick a market, deposit cash",
                d: "One tap turns USDG into an earning position — atomically, all or nothing.",
              },
              {
                n: "3",
                t: "Collect as you hold",
                d: "Trading fees accrue to your position. Withdraw back to cash anytime.",
              },
            ].map((s) => (
              <div key={s.n} className="rounded-3xl border border-borderline bg-surface p-7">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 font-mono text-base font-bold text-accent">
                  {s.n}
                </span>
                <p className="pt-4 text-lg font-semibold">{s.t}</p>
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
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Built on Robinhood Chain
        </h2>
        <p className="max-w-2xl pt-4 text-lg leading-relaxed text-muted">
          Robinhood Chain is the new blockchain launched by Robinhood in July
          2026 — built for tokenized stocks and markets that never close. It is
          why vaults.cash can exist:
        </p>
        <ul className="grid gap-5 pt-10 md:grid-cols-3">
          {[
            ["24/7 markets", "Tokenized stocks and crypto trade around the clock — your position earns while you sleep."],
            ["Fees in pennies", "Transactions confirm in under a second and cost less than a cent."],
            ["Fully public", "Every position, fee, and trade is verifiable on the public explorer. Nothing happens behind a curtain."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-3xl border border-borderline bg-surface p-7">
              <p className="text-lg font-semibold">{t}</p>
              <p className="pt-2 text-sm leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ul>
        <p className="pt-6 text-xs text-muted/70">
          vaults.cash is an independent app built on Robinhood Chain. It is not
          affiliated with, endorsed by, or sponsored by Robinhood Markets.
        </p>
      </section>

      {/* final CTA */}
      <section className="border-t border-borderline/60 bg-surface/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-7 px-6 py-20 text-center sm:py-24">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">
            Put your cash on the <span className="text-accent">earning side</span>.
          </h2>
          <ul className="flex flex-col gap-2 text-left text-sm text-muted sm:flex-row sm:gap-8">
            {[
              "Self-custodial — funds stay in your wallet",
              "Official Uniswap v4 pools",
              "One flat 0.6% fee. Nothing hidden",
            ].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-accent" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {line}
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

      <footer className="border-t border-borderline/60">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <FooterContent />
        </div>
      </footer>
    </div>
  );
}
