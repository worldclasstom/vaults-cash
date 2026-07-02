"use client";

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

export function MarketList() {
  const { data, isLoading, isError } = useMarketQuotes();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
        Couldn&apos;t reach Robinhood Chain. Check your connection and try again.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {data.map(({ market, price }) => (
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
  );
}
