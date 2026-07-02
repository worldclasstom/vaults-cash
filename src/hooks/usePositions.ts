"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { Position } from "@uniswap/v4-sdk";
import { robinhoodChain } from "@/lib/chain";
import { getPoolState, tickToUsdgPrice } from "@/lib/onchain";
import { fetchPositions, type OwnedPosition } from "@/lib/positions";
import { buildWithdrawPlan, buildCollectPlan } from "@/lib/withdraw";
import { buildPool } from "@/lib/zap";
import { useActiveAddress } from "./useChainData";

export type PositionView = OwnedPosition & {
  inRange: boolean;
  assetAmount: number;
  usdgAmount: number;
  valueUsd: number;
  price: number;
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
          const state = await getPoolState(p.market);
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
          return {
            ...p,
            inRange: state.tick >= p.tickLower && state.tick < p.tickUpper,
            assetAmount,
            usdgAmount,
            valueUsd: assetAmount * price + usdgAmount,
            price,
          };
        }),
      );
    },
  });
}

function useSendCalls() {
  const { getClientForChain } = useSmartWallets();
  return async (calls: Awaited<ReturnType<typeof buildCollectPlan>>) => {
    const client = await getClientForChain({ id: robinhoodChain.id });
    if (!client) throw new Error("Smart wallet unavailable — please re-login.");
    return client.sendTransaction({ calls });
  };
}

export function useWithdraw() {
  const send = useSendCalls();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (position: OwnedPosition) => {
      const plan = await buildWithdrawPlan({ position, slippageBps: 100 });
      return send(plan.calls);
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
      return send(await buildCollectPlan(position, owner));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["usdg-balance"] });
    },
  });
}
