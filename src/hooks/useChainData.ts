"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { erc20Abi, formatUnits } from "viem";
import { getPoolState, publicClient, tickToUsdgPrice } from "@/lib/onchain";
import { MARKETS, USDG, type Market } from "@/lib/markets";

/** The address funds live at: the embedded EOA (which, via EIP-7702
 *  delegation, is also the smart account — one address forever). */
export function useActiveAddress(): `0x${string}` | undefined {
  const { user } = usePrivy();
  return user?.wallet?.address as `0x${string}` | undefined;
}

export function useUsdgBalance() {
  const address = useActiveAddress();
  return useQuery({
    queryKey: ["usdg-balance", address],
    enabled: !!address,
    refetchInterval: 12_000,
    queryFn: async () => {
      const raw = await publicClient.readContract({
        address: USDG.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address!],
      });
      return { raw, formatted: Number(formatUnits(raw, USDG.decimals)) };
    },
  });
}

export function useTokenBalance(token: `0x${string}`, decimals: number) {
  const address = useActiveAddress();
  return useQuery({
    queryKey: ["token-balance", token, address],
    enabled: !!address,
    queryFn: async () => {
      const raw =
        token === "0x0000000000000000000000000000000000000000"
          ? await publicClient.getBalance({ address: address! })
          : await publicClient.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address!],
            });
      return { raw, formatted: Number(formatUnits(raw, decimals)) };
    },
  });
}

/** Non-USDG asset balances sitting in the wallet (e.g. withdrawal dust). */
export function useAssetBalances() {
  const address = useActiveAddress();
  return useQuery({
    queryKey: ["asset-balances", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async () => {
      const erc20Markets = MARKETS.filter(
        (m) => m.token !== "0x0000000000000000000000000000000000000000",
      );
      const balances = await Promise.all(
        erc20Markets.map(async (m) => {
          const raw = await publicClient.readContract({
            address: m.token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address!],
          });
          return { symbol: m.symbol, formatted: Number(formatUnits(raw, m.tokenDecimals)) };
        }),
      );
      return balances.filter((b) => b.formatted > 0);
    },
  });
}

export type MarketQuote = {
  market: Market;
  price: number;
  tick: number;
  liquidity: bigint;
};

export function useMarketQuotes() {
  return useQuery({
    queryKey: ["market-quotes"],
    refetchInterval: 15_000,
    queryFn: async (): Promise<MarketQuote[]> =>
      Promise.all(
        MARKETS.map(async (market) => {
          const state = await getPoolState(market);
          return {
            market,
            price: tickToUsdgPrice(market, state.tick),
            tick: state.tick,
            liquidity: state.liquidity,
          };
        }),
      ),
  });
}

export function useMarketQuote(market: Market | undefined) {
  return useQuery({
    queryKey: ["market-quote", market?.symbol],
    enabled: !!market,
    refetchInterval: 15_000,
    queryFn: async () => {
      const state = await getPoolState(market!);
      return {
        market: market!,
        price: tickToUsdgPrice(market!, state.tick),
        tick: state.tick,
        sqrtPriceX96: state.sqrtPriceX96,
        liquidity: state.liquidity,
      };
    },
  });
}
