"use client";

import { useState } from "react";
import Link from "next/link";
import { useMarketQuotes } from "@/hooks/useChainData";
import { fmtUsd } from "@/lib/format";
import type { Market } from "@/lib/markets";

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

const PAGE_SIZE = 6;

export function MarketList() {
  const { data, isLoading, isError } = useMarketQuotes();
  const [filter, setFilter] = useState<FilterId>("all");
  const [page, setPage] = useState(0);

  const changeFilter = (f: FilterId) => {
    setFilter(f);
    setPage(0);
  };

  const filtered = (data ?? []).filter(
    (d) => filter === "all" || d.market.kind === filter,
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
          Couldn&apos;t reach Robinhood Chain. Check your connection and try again.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {shown.map(({ market, price }) => (
              <li key={market.symbol}>
                <Link
                  href={`/market/${market.symbol.toLowerCase()}`}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-raised"
                >
                  <Monogram market={market} />
                  <span className="flex grow flex-col">
                    <span className="font-semibold">{market.symbol}</span>
                    <span className="text-sm text-muted">
                      {market.name}
                      {market.kind === "stock" && " · Stock token"}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="font-semibold">{fmtUsd(price)}</span>
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
