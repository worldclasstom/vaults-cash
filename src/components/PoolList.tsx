"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMarketQuotes, type MarketQuote } from "@/hooks/useChainData";
import { CHAINS, CHAIN_IDS, type ChainId } from "@/lib/chain";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { sharePrice, type Market } from "@/lib/markets";
import type { MarketStats } from "@/app/api/stats/route";
import { MarketChips, PairIcons } from "./TokenIcon";
import { Select } from "./Select";

type Category = "all" | "majors" | "crypto" | "stock";
const CATEGORIES: Array<{ id: Category; label: string; hint: string }> = [
  { id: "all", label: "All pools", hint: "" },
  { id: "majors", label: "ETH & BTC", hint: "Pairs of the two majors" },
  { id: "crypto", label: "Crypto", hint: "" },
  { id: "stock", label: "Stocks", hint: "Robinhood stock tokens" },
];
type Sort = "apr" | "tvl" | "vol";

const MAJORS = new Set(["ETH", "cbBTC", "cbETH", "wstETH", "rETH", "weETH"]);
function inCategory(m: Market, c: Category) {
  switch (c) {
    case "all":
      return true;
    case "majors":
      return MAJORS.has(m.base.symbol) && (MAJORS.has(m.quote.symbol) || m.quoteIsStable);
    case "crypto":
      return m.kind === "crypto";
    case "stock":
      return m.kind === "stock";
  }
}

export function useStats() {
  return useQuery<Record<string, MarketStats>>({
    queryKey: ["stats"],
    queryFn: async () => (await fetch("/api/stats")).json(),
    staleTime: 60_000,
  });
}

export function PoolList() {
  const { data, isLoading, isError } = useMarketQuotes();
  const { data: stats } = useStats();
  const [category, setCategory] = useState<Category>("all");
  const [q, setQ] = useState("");
  const [chain, setChain] = useState<ChainId | 0>(0);
  const [sort, setSort] = useState<Sort>("tvl");
  // pagination: a page of pools is a screen, not a scroll; filters reset it
  const PAGE = 8;
  const [page, setPage] = useState(0);
  const listTop = useRef<HTMLDivElement>(null);
  const pick = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };
  const goTo = (p: number) => {
    setPage(p);
    listTop.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matches = (m: Market) =>
      !needle || `${m.base.symbol} ${m.base.name} ${m.quote.symbol} ${m.quote.name} ${CHAINS[m.chainId].label}`.toLowerCase().includes(needle);
    const list = (data ?? []).filter(
      (q) =>
        matches(q.market) &&
        inCategory(q.market, category) &&
        (chain === 0 || q.market.chainId === chain) &&
        // the indexer says this pool is too thin to LP into sensibly;
        // pools it hasn't indexed yet stay visible
        !stats?.[q.market.slug]?.thin,
    );
    const s = (q: MarketQuote) => stats?.[q.market.slug];
    const key = (q: MarketQuote) =>
      sort === "apr" ? (s(q)?.estAprPct ?? -1) : sort === "tvl" ? (s(q)?.tvlUsd ?? -1) : (s(q)?.vol24hUsd ?? -1);
    return [...list].sort((a, b) => key(b) - key(a));
  }, [data, stats, category, chain, sort, q]);

  return (
    <div ref={listTop} className="scroll-mt-24">
      <div className="space-y-2 pb-3">
        {/* phones: search on its own line, the two selects side by side under it; wider: all three on one line */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 basis-full sm:basis-auto sm:grow">
            <span className="sr-only">Search pools</span>
            <input
              value={q}
              onChange={(e) => pick(setQ)(e.target.value)}
              placeholder="Search TSLA, ETH, NVDA…"
              className="w-full rounded-full bg-surface py-1.5 pl-3.5 pr-8 text-sm outline-none placeholder:text-muted/50 focus:ring-2 focus:ring-accent"
            />
            {q && (
              <button onClick={() => pick(setQ)("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground">
                ✕
              </button>
            )}
          </label>
          <Select<ChainId | 0>
            value={chain}
            onChange={pick(setChain)}
            ariaLabel="Network"
            options={[{ value: 0, label: "All networks" }, ...CHAIN_IDS.map((id) => ({ value: id, label: CHAINS[id].chain.name }))]}
          />
          <Select<Sort>
            value={sort}
            onChange={pick(setSort)}
            ariaLabel="Sort by"
            options={[
              { value: "tvl", label: "Most liquid", hint: "Deepest pools first" },
              { value: "apr", label: "Highest APR", hint: "Best recent fee rate" },
              { value: "vol", label: "Most traded", hint: "Busiest in 24h" },
            ]}
          />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(setCategory)(c.id)}
              title={c.hint || undefined}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                category === c.id ? "bg-accent text-black" : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      ) : isError || !data ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          Couldn&apos;t reach the network. Check your connection and try again.
        </p>
      ) : (
        <>
          <div className="sticky top-[59px] z-20 hidden grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_0.8fr] gap-3 bg-background/95 px-4 py-2 text-xs text-muted backdrop-blur-md sm:grid md:top-[67px]">
            <span>Pool</span>
            <span className="text-right">Price</span>
            <span className="text-right">Liquidity</span>
            <span className="text-right">24h volume</span>
            <span className="text-right">Est. APR</span>
          </div>
          <ul className="space-y-2">
            {rows.slice(page * PAGE, page * PAGE + PAGE).map((q) => (
              <PoolRow key={q.market.slug} q={q} s={stats?.[q.market.slug]} />
            ))}
          </ul>
          {rows.length === 0 && (
            <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted">Nothing here yet.</p>
          )}
          {rows.length > PAGE && (
            <Pager page={page} pages={Math.ceil(rows.length / PAGE)} total={rows.length} per={PAGE} onChange={goTo} />
          )}
        </>
      )}
    </div>
  );
}

/** Page pills: the current one green, the rest quiet; arrows at both ends. */
function Pager({ page, pages, total, per, onChange }: { page: number; pages: number; total: number; per: number; onChange: (p: number) => void }) {
  const first = page * per + 1;
  const last = Math.min(total, (page + 1) * per);
  const pill = (active: boolean) =>
    `h-9 min-w-9 rounded-full px-3 text-sm font-semibold transition-colors ${active ? "bg-accent text-black" : "bg-surface text-muted hover:text-foreground"} disabled:opacity-30 disabled:hover:text-muted`;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 pt-4" aria-label="Pool pages">
      <p className="text-xs text-muted">
        Showing {first}–{last} of {total} pools
      </p>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onChange(page - 1)} disabled={page === 0} className={pill(false)} aria-label="Previous page">
          ‹
        </button>
        {Array.from({ length: pages }, (_, i) => (
          <button key={i} onClick={() => onChange(i)} className={pill(i === page)} aria-current={i === page ? "page" : undefined}>
            {i + 1}
          </button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page >= pages - 1} className={pill(false)} aria-label="Next page">
          ›
        </button>
      </div>
    </nav>
  );
}

function PoolRow({ q, s }: { q: MarketQuote; s?: MarketStats }) {
  const m = q.market;
  const priceUsd = sharePrice(m, q.priceUsd);
  return (
    <li>
      <Link
        href={`/market/${m.slug}`}
        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 nudge rounded-2xl bg-surface p-4 shadow-card hover:bg-surface-raised sm:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_0.8fr]"
      >
        <span className="flex min-w-0 items-center gap-3 sm:col-span-1">
          <PairIcons market={m} size={34} />
          <span className="hidden min-w-0 flex-col gap-1 sm:flex">
            <span className="truncate font-display text-lg font-bold">
              {m.base.symbol} <span className="text-muted">/</span> {m.quote.symbol}
            </span>
            <MarketChips market={m} stats={s} />
          </span>
        </span>
        {/* mobile: name + chips in the middle column */}
        <span className="flex min-w-0 flex-col gap-1 sm:hidden">
          <span className="truncate font-display text-lg font-bold">
            {m.base.symbol} <span className="text-muted">/</span> {m.quote.symbol}
          </span>
          <MarketChips market={m} stats={s} />
          <span className="pt-1 text-xs text-muted">
            {s ? `${fmtUsd(s.tvlUsd, { compact: true })} liquidity` : `$${fmtPrice(priceUsd)}`}
          </span>
        </span>
        <span className="hidden text-right font-mono text-sm sm:block">${fmtPrice(priceUsd)}</span>
        <span className="hidden text-right text-sm sm:block">{s ? fmtUsd(s.tvlUsd, { compact: true }) : "—"}</span>
        <span className="hidden text-right text-sm sm:block">{s ? fmtUsd(s.vol24hUsd, { compact: true }) : "—"}</span>
        <span className="text-right">
          <span className="block font-display text-2xl font-extrabold tracking-tight text-accent">{s ? fmtPct(s.estAprPct) : "—"}</span>
          <span className="block text-[11px] text-muted sm:hidden">est. APR</span>
        </span>
      </Link>
    </li>
  );
}
