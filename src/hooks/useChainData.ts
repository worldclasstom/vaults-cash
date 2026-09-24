"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { erc20Abi, formatUnits } from "viem";
import { CHAIN_IDS, chainConfig } from "@/lib/chain";
import { getPoolState, publicClientFor, tickToUsdcPrice } from "@/lib/onchain";
import { MARKETS, NATIVE_ETH, type Market } from "@/lib/markets";

/** The address funds live at: the user's Privy SMART wallet (a linked
 *  account of type "smart_wallet"), not the underlying embedded EOA — the
 *  smart wallet is what useSendCalls spends from, so it's what holds the
 *  USDC and owns the LP positions. Same address on every chain. Falls back
 *  to the EOA only before the smart wallet has been created (first login)
 *  so balances still render. */
export function useActiveAddress(): `0x${string}` | undefined {
  const { user } = usePrivy();
  const sw = user?.linkedAccounts.find((a) => a.type === "smart_wallet") as
    | { address?: string }
    | undefined;
  return (sw?.address ?? user?.wallet?.address) as `0x${string}` | undefined;
}

/** Balance of a chain's quote stablecoin (USDC on Base, USDG on Robinhood). */
export function useQuoteBalance(chainId: number = 8453) {
  const address = useActiveAddress();
  const quote = chainConfig(chainId).quote;
  return useQuery({
    queryKey: ["usdc-balance", chainId, address],
    enabled: !!address,
    refetchInterval: 12_000,
    queryFn: async () => {
      const raw = await publicClientFor(chainId).readContract({
        address: quote.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address!],
      });
      return { raw, formatted: Number(formatUnits(raw, quote.decimals)), symbol: quote.symbol };
    },
  });
}

/** Base USDC balance — the "cash available" number the app is built around. */
export const useUsdcBalance = () => useQuoteBalance(8453);

/** Quote-stablecoin balance on every chain, summed for a single "cash" figure. */
export function useCashBalances() {
  const address = useActiveAddress();
  return useQuery({
    queryKey: ["cash-balances", address],
    enabled: !!address,
    refetchInterval: 12_000,
    queryFn: async () => {
      const perChain = await Promise.all(
        CHAIN_IDS.map(async (chainId) => {
          const quote = chainConfig(chainId).quote;
          const raw = await publicClientFor(chainId)
            .readContract({
              address: quote.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address!],
            })
            .catch(() => 0n);
          return { chainId, symbol: quote.symbol, raw, formatted: Number(formatUnits(raw, quote.decimals)) };
        }),
      );
      return { perChain, totalUsd: perChain.reduce((s, c) => s + c.formatted, 0) };
    },
  });
}

export function useTokenBalance(token: `0x${string}`, decimals: number, chainId: number = 8453) {
  const address = useActiveAddress();
  return useQuery({
    queryKey: ["token-balance", chainId, token, address],
    enabled: !!address,
    queryFn: async () => {
      const client = publicClientFor(chainId);
      const raw =
        token === NATIVE_ETH
          ? await client.getBalance({ address: address! })
          : await client.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address!],
            });
      return { raw, formatted: Number(formatUnits(raw, decimals)) };
    },
  });
}

/** Non-quote asset balances sitting in the wallet (e.g. withdrawal dust). */
export function useAssetBalances() {
  const address = useActiveAddress();
  return useQuery({
    queryKey: ["asset-balances", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async () => {
      const erc20Markets = MARKETS.filter((m) => m.token !== NATIVE_ETH);
      const balances = await Promise.all(
        erc20Markets.map(async (m) => {
          const raw = await publicClientFor(m.chainId)
            .readContract({
              address: m.token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address!],
            })
            .catch(() => 0n);
          return {
            symbol: m.symbol,
            chainId: m.chainId,
            formatted: Number(formatUnits(raw, m.tokenDecimals)),
          };
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
    queryFn: async (): Promise<MarketQuote[]> => {
      // one chain's RPC hiccup must not blank the other chain's markets
      const results = await Promise.allSettled(
        MARKETS.map(async (market) => {
          const state = await getPoolState(market);
          return {
            market,
            price: tickToUsdcPrice(market, state.tick),
            tick: state.tick,
            liquidity: state.liquidity,
          };
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (ok.length === 0) throw (results[0] as PromiseRejectedResult).reason;
      return ok;
    },
  });
}

export function useMarketQuote(market: Market | undefined) {
  return useQuery({
    queryKey: ["market-quote", market?.slug],
    enabled: !!market,
    refetchInterval: 15_000,
    queryFn: async () => {
      const state = await getPoolState(market!);
      return {
        market: market!,
        price: tickToUsdcPrice(market!, state.tick),
        tick: state.tick,
        sqrtPriceX96: state.sqrtPriceX96,
        liquidity: state.liquidity,
      };
    },
  });
}
