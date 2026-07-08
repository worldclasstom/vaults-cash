"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { LogoMark } from "@/components/Logo";
import type { MarketStats } from "@/app/api/stats/route";
import { fmtPct, fmtUsd } from "@/lib/format";

/* ---------------------------------------------------------------- charts */

function TraderChart() {
  return (
    <svg viewBox="0 0 120 56" fill="none" className="h-14 w-full" aria-hidden>
      <path
        d="M4 18 L20 30 L32 22 L46 40 L60 28 L74 44 L90 38 L104 50 L116 46"
        stroke="var(--negative)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-path"
      />
    </svg>
  );
}

function HolderChart() {
  return (
    <svg viewBox="0 0 120 56" fill="none" className="h-14 w-full" aria-hidden>
      <path
        d="M4 30 C 24 26, 40 34, 60 30 S 100 26, 116 30"
        stroke="var(--muted)"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="draw-path"
      />
    </svg>
  );
}

function EarnerChart() {
  return (
    <svg viewBox="0 0 120 56" fill="none" className="h-14 w-full" aria-hidden>
      <path
        d="M4 34 C 24 30, 40 36, 60 31 S 100 26, 116 28"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="draw-path"
      />
      {[
        [22, 22],
        [46, 24],
        [70, 19],
        [94, 15],
      ].map(([x, y], i) => (
        <g key={i} className="tick-pop" style={{ animationDelay: `${0.9 + i * 0.35}s` }}>
          <circle cx={x} cy={y} r="7" fill="var(--accent)" opacity="0.18" />
          <text
            x={x}
            y={y + 3}
            textAnchor="middle"
            fontSize="8"
            fontWeight="700"
            fill="var(--accent)"
          >
            +$
          </text>
        </g>
      ))}
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
  const eth = stats?.ETH;
  const monthly = eth ? (amount * eth.estAprPct) / 100 / 12 : undefined;

  return (
    <div className="rounded-3xl bg-surface p-6">
      <p className="text-sm font-semibold">If you put in</p>
      <div className="flex items-baseline gap-1 pt-1">
        <span className="text-2xl font-bold text-muted">$</span>
        <input
          inputMode="numeric"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
          className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none"
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
        className="mt-3 w-full accent-[var(--accent)]"
        aria-label="Deposit amount slider"
      />
      <div className="mt-4 rounded-2xl bg-surface-raised p-4">
        <p className="text-sm text-muted">could earn about</p>
        <p className="py-1 text-3xl font-bold text-accent">
          {monthly !== undefined ? `${fmtUsd(monthly)} / month` : "…"}
        </p>
        <p className="text-xs text-muted">
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
    <div className="animate-rise space-y-16 py-10">
      {/* hero */}
      <section className="flex flex-col items-center gap-6 text-center">
        <LogoMark size={64} />
        <p className="rounded-full bg-accent/10 px-4 py-1 text-xs font-semibold text-accent">
          Now live on Robinhood Chain
        </p>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Every trade pays a fee.
          <br />
          Be the one <span className="text-accent">collecting it</span>.
        </h1>
        <p className="max-w-md text-balance text-muted">
          vaults.cash puts your cash on the earning side of the market: hold
          blue-chip crypto and tokenized stocks, and collect a slice of every
          trade — without trading.
        </p>
        <div className="flex items-center gap-4">
          <button
            onClick={login}
            className="rounded-full bg-accent px-8 py-3 font-semibold text-black transition-colors hover:bg-accent-strong"
          >
            Get started
          </button>
          <Link
            href="/how-it-works"
            className="text-sm font-semibold text-muted transition-colors hover:text-foreground"
          >
            How it works →
          </Link>
        </div>
      </section>

      {/* why */}
      <section className="space-y-3">
        <h2 className="text-center text-2xl font-bold">
          The middle ground the market forgot
        </h2>
        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          <div className="rounded-3xl bg-surface p-5">
            <TraderChart />
            <p className="pt-3 font-semibold">Trading is hard</p>
            <p className="pt-1 text-sm text-muted">
              Timing the market is a full-time job, and most people who try end
              up behind where simply holding would have left them.
            </p>
          </div>
          <div className="rounded-3xl bg-surface p-5">
            <HolderChart />
            <p className="pt-3 font-semibold">Holding earns nothing</p>
            <p className="pt-1 text-sm text-muted">
              Holding is easier — but your assets just sit there. No income, no
              cashflow, nothing working for you.
            </p>
          </div>
          <div className="rounded-3xl border border-accent/30 bg-surface p-5">
            <EarnerChart />
            <p className="pt-3 font-semibold text-accent">Hold — and collect</p>
            <p className="pt-1 text-sm text-muted">
              Your assets sit in a market position that traders trade against.
              You keep holding; every trade pays you a fee — in ETH, USDG, or
              stock tokens.
            </p>
          </div>
        </div>
      </section>

      {/* calculator */}
      <section className="space-y-3">
        <h2 className="text-center text-2xl font-bold">What could that earn?</h2>
        <EarningsCalculator />
      </section>

      {/* how */}
      <section className="space-y-3">
        <h2 className="text-center text-2xl font-bold">Three taps, no jargon</h2>
        <div className="grid gap-3 pt-2 sm:grid-cols-3">
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
            <div key={s.n} className="rounded-3xl bg-surface p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 font-mono text-sm font-bold text-accent">
                {s.n}
              </span>
              <p className="pt-3 font-semibold">{s.t}</p>
              <p className="pt-1 text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </div>
        <p className="text-center">
          <Link
            href="/how-it-works"
            className="text-sm font-semibold text-accent underline-offset-2 hover:underline"
          >
            See exactly what happens to your money →
          </Link>
        </p>
      </section>

      {/* chain */}
      <section className="rounded-3xl bg-surface p-6">
        <h2 className="text-2xl font-bold">Built on Robinhood Chain</h2>
        <p className="pt-2 text-sm leading-relaxed text-muted">
          Robinhood Chain is the new blockchain launched by Robinhood in July
          2026 — built for tokenized stocks and markets that never close. It is
          why vaults.cash can exist:
        </p>
        <ul className="grid gap-3 pt-4 sm:grid-cols-3">
          {[
            ["24/7 markets", "Tokenized stocks and crypto trade around the clock — your position earns while you sleep."],
            ["Fees in pennies", "Transactions confirm in under a second and cost less than a cent."],
            ["Fully public", "Every position, fee, and trade is verifiable on the public explorer. Nothing happens behind a curtain."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-2xl bg-surface-raised p-4">
              <p className="text-sm font-semibold">{t}</p>
              <p className="pt-1 text-xs text-muted">{d}</p>
            </li>
          ))}
        </ul>
        <p className="pt-4 text-xs text-muted/70">
          vaults.cash is an independent app built on Robinhood Chain. It is not
          affiliated with, endorsed by, or sponsored by Robinhood Markets.
        </p>
      </section>

      {/* trust + final CTA */}
      <section className="flex flex-col items-center gap-6 text-center">
        <ul className="space-y-2 text-left text-sm text-muted">
          {[
            "Self-custodial — funds stay in your own wallet",
            "Official Uniswap v4 pools, verifiable on-chain",
            "One flat 0.6% conversion fee. Nothing hidden",
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
          className="rounded-full bg-accent px-10 py-3.5 font-semibold text-black transition-colors hover:bg-accent-strong"
        >
          Start earning
        </button>
        <p className="text-xs text-muted">
          Liquidity positions carry market &amp; impermanent-loss risk. Not
          available in all regions.
        </p>
      </section>
    </div>
  );
}
