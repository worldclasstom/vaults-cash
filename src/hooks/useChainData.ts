"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { erc20Abi, formatUnits } from "viem";
import { getPoolState, publicClient, tickToUsdcPrice } from "@/lib/onchain";
import { MARKETS, USDC, type Market } from "@/lib/markets";

/** The address funds live at: the embedded EOA (which, via EIP-7702
 *  delegation, is also the smart account — one address forever).
 *
 *  Prefer the embedded (Privy) wallet whenever one exists — that's the account
 *  the deposit/withdraw path spends from (useSendCalls' atomic 7702 path).
 *  Only fall back to user.wallet (a linked external wallet) when there is no
 *  embedded wallet, which matches the sequential path's account. This keeps the
 *  displayed/QR deposit address identical to the wallet the app transacts with,
 *  even for a user who signed in by email and later linked an external wallet. */
export function useActiveAddress(): `0x${string}` | undefined {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  return (embedded?.address ?? user?.wallet?.address) as `0x${string}` | undefined;
}

export function useUsdcBalance() {
  const address = useActiveAddress();
  return useQuery({
    queryKey: ["usdc-balance", address],
    enabled: !!address,
    refetchInterval: 12_000,
    queryFn: async () => {
      const raw = await publicClient.readContract({
        address: USDC.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address!],
      });
      return { raw, formatted: Number(formatUnits(raw, USDC.decimals)) };
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

/** Non-USDC asset balances sitting in the wallet (e.g. withdrawal dust). */
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
            price: tickToUsdcPrice(market, state.tick),
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
        price: tickToUsdcPrice(market!, state.tick),
        tick: state.tick,
        sqrtPriceX96: state.sqrtPriceX96,
        liquidity: state.liquidity,
      };
    },
  });
}
