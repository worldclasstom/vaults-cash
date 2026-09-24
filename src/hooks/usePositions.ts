"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Position } from "@uniswap/v4-sdk";
import { getPoolState, tickToUsdcPrice } from "@/lib/onchain";
import { fetchPositions, getUncollectedFees, type OwnedPosition } from "@/lib/positions";
import { buildWithdrawPlan, buildCollectPlan } from "@/lib/withdraw";
import { buildPool } from "@/lib/zap";
import { useActiveAddress } from "./useChainData";
import { useSendCalls } from "./useSendCalls";

export type PositionView = OwnedPosition & {
  inRange: boolean;
  assetAmount: number;
  usdcAmount: number;
  valueUsd: number;
  price: number;
  /** uncollected trading fees, in USD */
  feesUsd: number;
};

export function usePositions() {
  const owner = useActiveAddress();
  return useQuery({
    queryKey: ["positions", owner],
    enabled: !!owner,
    refetchInterval: 20_000,
    queryFn: async (): Promise<PositionView[]> => {
      const owned = await fetchPositions(owner!);
      return Promise.all(
        owned.map(async (p) => {
          const [state, fees] = await Promise.all([
            getPoolState(p.market),
            getUncollectedFees(p).catch(() => ({ owed0: 0n, owed1: 0n })),
          ]);
          const pool = buildPool(p.market, state.sqrtPriceX96, state.tick, state.liquidity);
          const sdkPos = new Position({
            pool,
            tickLower: p.tickLower,
            tickUpper: p.tickUpper,
            liquidity: p.liquidity.toString(),
          });
          const price = tickToUsdcPrice(p.market, state.tick);
          const c0 = p.market.assetIsCurrency0;
          const assetAmount = Number((c0 ? sdkPos.amount0 : sdkPos.amount1).toExact());
          const usdcAmount = Number((c0 ? sdkPos.amount1 : sdkPos.amount0).toExact());
          const assetOwed = c0 ? fees.owed0 : fees.owed1;
          const usdcOwed = c0 ? fees.owed1 : fees.owed0;
          const feesUsd =
            (Number(assetOwed) / 10 ** p.market.tokenDecimals) * price +
            Number(usdcOwed) / 10 ** p.market.quote.decimals;
          return {
            ...p,
            inRange: state.tick >= p.tickLower && state.tick < p.tickUpper,
            assetAmount,
            usdcAmount,
            valueUsd: assetAmount * price + usdcAmount,
            price,
            feesUsd,
          };
        }),
      );
    },
  });
}

export function useWithdraw() {
  const send = useSendCalls();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (position: OwnedPosition) => {
      // tight tolerance: the slippage buffer is exactly what comes back as
      // non-USDC dust, and blocks are ~250ms — worst case a revert + retry
      const plan = await buildWithdrawPlan({ position, slippageBps: 25 });
      return send(plan.calls, {
        description: `Withdraw position to ${position.market.quote.symbol}`,
        chainId: plan.chainId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
      queryClient.invalidateQueries({ queryKey: ["cash-balances"] });
    },
  });
}

export function useCollect() {
  const send = useSendCalls();
  const owner = useActiveAddress();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (position: OwnedPosition) => {
      if (!owner) throw new Error("Wallet not ready");
      return send(await buildCollectPlan(position, owner), {
        description: "Collect earned fees",
        chainId: position.market.chainId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
      queryClient.invalidateQueries({ queryKey: ["cash-balances"] });
    },
  });
}
