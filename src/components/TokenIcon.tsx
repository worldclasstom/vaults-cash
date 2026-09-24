"use client";

import { useState } from "react";
import { chainConfig } from "@/lib/chain";
import type { Market, TokenInfo } from "@/lib/markets";

/** Token logo from the registry (GeckoTerminal images), falling back to a
 *  brand-colored monogram — which is also what the Robinhood stock tokens
 *  look like natively, so the fallback reads as intentional. */
export function TokenIcon({ token, size = 32, className = "" }: { token: TokenInfo; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const letters = token.kind === "stock" ? 2 : 1;
  const style = { width: size, height: size, fontSize: Math.round(size * (letters === 2 ? 0.3 : 0.42)), letterSpacing: letters === 2 ? "-0.02em" : undefined };
  if (token.logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.logo}
        alt={token.symbol}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full bg-surface-raised object-cover ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-label={token.symbol}
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{ ...style, backgroundColor: token.color }}
    >
      {token.symbol.slice(0, letters)}
    </span>
  );
}

/** The two legs of a pair, overlapped the way every DEX draws them. */
export function PairIcons({ market, size = 32 }: { market: Market; size?: number }) {
  const overlap = Math.round(size * 0.3);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size * 2 - overlap, height: size }}>
      {/* quote sits underneath so the base's ticker monogram is never clipped */}
      <span className="absolute top-0" style={{ left: size - overlap }}>
        <TokenIcon token={market.quote} size={size} className="ring-2 ring-surface" />
      </span>
      <span className="absolute left-0 top-0">
        <TokenIcon token={market.base} size={size} className="ring-2 ring-surface" />
      </span>
    </span>
  );
}

export function Chip({
  children,
  tone = "muted",
  title,
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "negative" | "outline";
  title?: string;
}) {
  const cls = {
    muted: "bg-surface-raised text-muted",
    accent: "bg-accent/15 text-accent",
    negative: "bg-negative/15 text-negative",
    outline: "border border-borderline text-muted",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${cls}`}>
      {children}
    </span>
  );
}

/** The standard chip row for a market: fee tier, chain, and what kind of
 *  pair it is in plain words. */
export function MarketChips({ market, chain = true }: { market: Market; chain?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Chip title="Share of every trade that LPs earn">{market.pool.fee / 10_000}% fee</Chip>
      {chain && <Chip tone="outline">{chainConfig(market.chainId).label}</Chip>}
      {market.lowIl && (
        <Chip tone="accent" title="Both sides track the same thing, so price swings barely change what you hold">
          Steady
        </Chip>
      )}
      {market.kind === "stock" && <Chip>Stock token</Chip>}
    </span>
  );
}
