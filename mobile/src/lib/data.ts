/** Read-only market data, straight from the shared web library and the web app's stats route. */
import { useQuery } from "@tanstack/react-query";
import { MARKETS, type Market } from "@web/lib/markets";
import { getPricingMap, type MarketPricing } from "@web/lib/onchain";
import { erc20Abi, formatUnits } from "viem";
import { CHAINS, CHAIN_IDS } from "@web/lib/chain";
import { publicClientFor } from "@web/lib/onchain";
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

export type CashBalances = { totalUsd: number; perChain: Array<{ chainId: number; symbol: string; formatted: number }> };

/** The wallet's stablecoin on each chain (USDC on Base, USDG on Robinhood). */
export function useCash(address: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ["cash-balances", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async (): Promise<CashBalances> => {
      const perChain = await Promise.all(
        CHAIN_IDS.map(async (chainId) => {
          const q = CHAINS[chainId].quote;
          const raw = await publicClientFor(chainId)
            .readContract({ address: q.address, abi: erc20Abi, functionName: "balanceOf", args: [address!] })
            .catch(() => 0n);
          return { chainId, symbol: q.symbol, formatted: Number(formatUnits(raw, q.decimals)) };
        }),
      );
      return { totalUsd: perChain.reduce((s, c) => s + c.formatted, 0), perChain };
    },
  });
}
