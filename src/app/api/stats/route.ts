import { NextResponse } from "next/server";
import { MARKETS } from "@/lib/markets";

export const revalidate = 60;

export type MarketStats = {
  tvlUsd: number;
  vol24hUsd: number;
  /** naive fee APR: 24h volume × fee tier ÷ TVL, annualized */
  estAprPct: number;
};

export async function GET() {
  const out: Record<string, MarketStats> = {};
  await Promise.all(
    MARKETS.map(async (m) => {
      try {
        const res = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/robinhood/pools/${m.pool.poolId}`,
          { headers: { accept: "application/json" }, next: { revalidate: 60 } },
        );
        if (!res.ok) return;
        const body = await res.json();
        const attrs = body?.data?.attributes;
        const tvlUsd = Number(attrs?.reserve_in_usd ?? 0);
        const vol24hUsd = Number(attrs?.volume_usd?.h24 ?? 0);
        if (tvlUsd <= 0) return; // indexer hasn't picked this pool up — show "—"
        const feeFrac = m.pool.fee / 1_000_000;
        out[m.symbol] = {
          tvlUsd,
          vol24hUsd,
          estAprPct: ((vol24hUsd * feeFrac) / tvlUsd) * 365 * 100,
        };
      } catch {
        /* stats are decorative — never fail the page over them */
      }
    }),
  );
  return NextResponse.json(out);
}
