"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Position } from "@uniswap/v4-sdk";
import { getPoolState, tickToUsdgPrice } from "@/lib/onchain";
import { fetchPositions, getUncollectedFees, type OwnedPosition } from "@/lib/positions";
import { buildWithdrawPlan, buildCollectPlan } from "@/lib/withdraw";
import { buildPool } from "@/lib/zap";
import { useActiveAddress } from "./useChainData";
import { useSendCalls } from "./useSendCalls";

export type PositionView = OwnedPosition & {
  inRange: boolean;
  assetAmount: number;
  usdgAmount: number;
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
          const price = tickToUsdgPrice(p.market, state.tick);
          const assetAmount = Number(sdkPos.amount0.toExact());
          const usdgAmount = Number(sdkPos.amount1.toExact());
          const feesUsd =
            (Number(fees.owed0) / 10 ** p.market.tokenDecimals) * price +
            Number(fees.owed1) / 1e6;
          return {
            ...p,
            inRange: state.tick >= p.tickLower && state.tick < p.tickUpper,
            assetAmount,
            usdgAmount,
            valueUsd: assetAmount * price + usdgAmount,
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
      const plan = await buildWithdrawPlan({ position, slippageBps: 100 });
      return send(plan.calls, { description: "Withdraw position to USDG" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["usdg-balance"] });
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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["usdg-balance"] });
    },
  });
}
