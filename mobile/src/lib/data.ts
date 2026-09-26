/** Read-only market data, straight from the shared web library and the web app's stats route. */
import { useQuery } from "@tanstack/react-query";
import { MARKETS, type Market } from "@web/lib/markets";
import { getPricingMap, type MarketPricing } from "@web/lib/onchain";
import { API_ORIGIN } from "./config";

export type MarketStats = { tvlUsd: number; vol24hUsd: number; fees24hUsd: number; estAprPct: number };

export function useMarketQuotes() {
  return useQuery({
    queryKey: ["market-quotes"],
    refetchInterval: 15_000,
    queryFn: async (): Promise<Array<{ market: Market } & MarketPricing>> => {
      const pricing = await getPricingMap(MARKETS);
      if (pricing.size === 0) throw new Error("no market data");
      return MARKETS.flatMap((market) => {
        const p = pricing.get(market.slug);
        return p ? [{ market, ...p }] : [];
      });
    },
  });
}

export function useStats() {
  return useQuery<Record<string, MarketStats>>({
    queryKey: ["stats"],
    staleTime: 60_000,
    queryFn: async () => (await fetch(`${API_ORIGIN}/api/stats`)).json(),
  });
}
