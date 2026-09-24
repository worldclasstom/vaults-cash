"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMarketQuotes } from "@/hooks/useChainData";
import { chainConfig } from "@/lib/chain";
import { fmtUsd } from "@/lib/format";
import { sharePrice, type Market } from "@/lib/markets";
import type { MarketStats } from "@/app/api/stats/route";

function Monogram({ market }: { market: Market }) {
  return (
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
      style={{ backgroundColor: market.color }}
    >
      {market.symbol.slice(0, 1)}
    </span>
  );
}

const FILTERS = [
  { id: "all", label: "All Markets" },
  { id: "stock", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

const PAGE_SIZE = 8;

export function MarketList() {
  const { data, isLoading, isError } = useMarketQuotes();
  // markets the indexer knows to be too thin to LP into sensibly are hidden;
  // ones it hasn't indexed yet stay visible
  const { data: stats } = useQuery<Record<string, MarketStats>>({
    queryKey: ["stats"],
    queryFn: async () => (await fetch("/api/stats")).json(),
    staleTime: 60_000,
  });
  const [filter, setFilter] = useState<FilterId>("all");
  const [page, setPage] = useState(0);

  const changeFilter = (f: FilterId) => {
    setFilter(f);
    setPage(0);
  };

  const filtered = (data ?? []).filter(
    (d) => (filter === "all" || d.market.kind === filter) && !stats?.[d.market.slug]?.thin,
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const shown = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => changeFilter(f.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id
                ? "bg-accent text-black"
                : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      ) : isError || !data ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          Couldn&apos;t reach the network. Check your connection and try again.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {shown.map(({ market, price }) => (
              <li key={market.slug}>
                <Link
                  href={`/market/${market.slug}`}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-raised"
                >
                  <Monogram market={market} />
                  <span className="flex grow flex-col">
                    <span className="font-semibold">{market.symbol}</span>
                    <span className="text-sm text-muted">
                      {market.name}
                      {market.kind === "stable" && " · Stablecoin"}
                      {market.chainId !== 8453 && ` · ${chainConfig(market.chainId).label}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="font-semibold">{fmtUsd(sharePrice(market, price))}</span>
                    <span className="text-xs text-accent">
                      Earn · {market.pool.fee / 10_000}% pool
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-5 text-sm">
              <button
                onClick={() => setPage(clampedPage - 1)}
                disabled={clampedPage === 0}
                className="text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-muted">
                Page {clampedPage + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(clampedPage + 1)}
                disabled={clampedPage >= totalPages - 1}
                className="text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
