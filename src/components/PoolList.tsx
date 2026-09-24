"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMarketQuotes, type MarketQuote } from "@/hooks/useChainData";
import { CHAINS, CHAIN_IDS, type ChainId } from "@/lib/chain";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { sharePrice, type Market } from "@/lib/markets";
import type { MarketStats } from "@/app/api/stats/route";
import { MarketChips, PairIcons } from "./TokenIcon";

type Category = "all" | "steady" | "majors" | "crypto" | "stock";
const CATEGORIES: Array<{ id: Category; label: string; hint: string }> = [
  { id: "all", label: "All pools", hint: "" },
  { id: "steady", label: "Steady", hint: "Both sides track the same thing — minimal price risk" },
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
    case "steady":
      return m.lowIl;
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
  const [chain, setChain] = useState<ChainId | 0>(0);
  const [sort, setSort] = useState<Sort>("tvl");

  const rows = useMemo(() => {
    const list = (data ?? []).filter(
      (q) =>
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
  }, [data, stats, category, chain, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            title={c.hint || undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              category === c.id ? "bg-accent text-black" : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
        <span className="grow" />
        <select
          value={chain}
          onChange={(e) => setChain(Number(e.target.value) as ChainId | 0)}
          className="rounded-full bg-surface px-3 py-1.5 text-sm text-muted outline-none"
          aria-label="Network"
        >
          <option value={0}>All networks</option>
          {CHAIN_IDS.map((id) => (
            <option key={id} value={id}>
              {CHAINS[id].chain.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-full bg-surface px-3 py-1.5 text-sm text-muted outline-none"
          aria-label="Sort"
        >
          <option value="tvl">Most liquid</option>
          <option value="apr">Highest APR</option>
          <option value="vol">Most traded</option>
        </select>
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
          <div className="hidden grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_0.8fr] gap-3 px-4 pb-2 text-xs text-muted sm:grid">
            <span>Pool</span>
            <span className="text-right">Price</span>
            <span className="text-right">Liquidity</span>
            <span className="text-right">24h volume</span>
            <span className="text-right">Est. APR</span>
          </div>
          <ul className="space-y-2">
            {rows.map((q) => (
              <PoolRow key={q.market.slug} q={q} s={stats?.[q.market.slug]} />
            ))}
          </ul>
          {rows.length === 0 && (
            <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted">Nothing here yet.</p>
          )}
        </>
      )}
    </div>
  );
}

function PoolRow({ q, s }: { q: MarketQuote; s?: MarketStats }) {
  const m = q.market;
  const priceUsd = sharePrice(m, q.priceUsd);
  return (
    <li>
      <Link
        href={`/market/${m.slug}`}
        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-raised sm:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_0.8fr]"
      >
        <span className="flex min-w-0 items-center gap-3 sm:col-span-1">
          <PairIcons market={m} size={34} />
          <span className="hidden min-w-0 flex-col sm:flex">
            <span className="truncate font-semibold">
              {m.base.symbol} <span className="text-muted">/</span> {m.quote.symbol}
            </span>
            <MarketChips market={m} />
          </span>
        </span>
        {/* mobile: name + chips in the middle column */}
        <span className="flex min-w-0 flex-col sm:hidden">
          <span className="truncate font-semibold">
            {m.base.symbol} <span className="text-muted">/</span> {m.quote.symbol}
          </span>
          <MarketChips market={m} />
          <span className="pt-1 text-xs text-muted">
            {s ? `${fmtUsd(s.tvlUsd, { compact: true })} liquidity` : `$${fmtPrice(priceUsd)}`}
          </span>
        </span>
        <span className="hidden text-right font-mono text-sm sm:block">${fmtPrice(priceUsd)}</span>
        <span className="hidden text-right text-sm sm:block">{s ? fmtUsd(s.tvlUsd, { compact: true }) : "—"}</span>
        <span className="hidden text-right text-sm sm:block">{s ? fmtUsd(s.vol24hUsd, { compact: true }) : "—"}</span>
        <span className="text-right">
          <span className="block font-semibold text-accent">{s ? fmtPct(s.estAprPct) : "—"}</span>
          <span className="block text-[11px] text-muted sm:hidden">est. APR</span>
        </span>
      </Link>
    </li>
  );
}
