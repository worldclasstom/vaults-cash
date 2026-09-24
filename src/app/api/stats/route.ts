import { NextResponse } from "next/server";
import { CHAIN_IDS, chainConfig } from "@/lib/chain";
import { marketsOnChain } from "@/lib/markets";

export const revalidate = 60;

export type MarketStats = {
  tvlUsd: number;
  vol24hUsd: number;
  /** trading fees paid to LPs in the last 24h: volume × fee tier */
  fees24hUsd: number;
  /** naive fee APR: 24h fees ÷ TVL, annualized */
  estAprPct: number;
  /** below MIN_TVL_USD — listed automatically from the registry but not
   *  worth LPing into; the market list hides these */
  thin: boolean;
};

const MIN_TVL_USD = 25_000;
/** GeckoTerminal's batch endpoint takes up to 30 pool addresses; the free
 *  tier allows 30 requests/minute, which one-request-per-pool blew through. */
const BATCH = 30;

/** Keyed by market slug. */
export async function GET() {
  const out: Record<string, MarketStats> = {};
  await Promise.all(
    CHAIN_IDS.map(async (chainId) => {
      const markets = marketsOnChain(chainId);
      const network = chainConfig(chainId).gecko;
      const bySlug = new Map(markets.map((m) => [m.pool.poolId.toLowerCase(), m]));
      for (let i = 0; i < markets.length; i += BATCH) {
        const ids = markets.slice(i, i + BATCH).map((m) => m.pool.poolId);
        try {
          const res = await fetch(
            `https://api.geckoterminal.com/api/v2/networks/${network}/pools/multi/${ids.join(",")}`,
            { headers: { accept: "application/json" }, next: { revalidate: 60 } },
          );
          if (!res.ok) continue;
          const body = await res.json();
          for (const item of body?.data ?? []) {
            const addr = String(item?.attributes?.address ?? "").toLowerCase();
            const m = bySlug.get(addr);
            if (!m) continue;
            const tvlUsd = Number(item.attributes?.reserve_in_usd ?? 0);
            const vol24hUsd = Number(item.attributes?.volume_usd?.h24 ?? 0);
            if (tvlUsd <= 0) continue; // indexer hasn't picked this pool up — show "—"
            const fees24hUsd = vol24hUsd * (m.pool.fee / 1_000_000);
            out[m.slug] = {
              tvlUsd,
              vol24hUsd,
              fees24hUsd,
              estAprPct: (fees24hUsd / tvlUsd) * 365 * 100,
              thin: tvlUsd < MIN_TVL_USD,
            };
          }
        } catch {
          /* stats are decorative — never fail the page over them */
        }
      }
    }),
  );
  return NextResponse.json(out);
}
