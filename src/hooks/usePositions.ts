"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Position } from "@uniswap/v4-sdk";
import { getMarketPricing } from "@/lib/onchain";
import { fetchPositions, getUncollectedFees, type OwnedPosition } from "@/lib/positions";
import { buildWithdrawPlan, buildCollectPlan, type WithdrawPlan } from "@/lib/withdraw";
import { buildPool } from "@/lib/zap";
import { useActiveAddress } from "./useChainData";
import { useSendCalls } from "./useSendCalls";
import { useReferral } from "./useReferral";
import { playKaching } from "@/lib/sound";

export type PositionView = OwnedPosition & {
  inRange: boolean;
  /** decimal-adjusted token amounts in the position */
  baseAmount: number;
  quoteAmount: number;
  /** base in quote units */
  price: number;
  /** quote in dollars (1 for the stablecoin) */
  quoteUsd: number;
  valueUsd: number;
  /** uncollected trading fees, in USD */
  feesUsd: number;
  currentTick: number;
  // aliases
  assetAmount: number;
  usdcAmount: number;
};

export function usePositions() {
  const owner = useActiveAddress();
  return useQuery({
    queryKey: ["positions", owner],
    enabled: !!owner,
    // poll fast while empty — that's the window where a just-minted
    // position is still being indexed
    refetchInterval: (q) => (q.state.data && q.state.data.length === 0 ? 5_000 : 20_000),
    queryFn: async (): Promise<PositionView[]> => {
      const owned = await fetchPositions(owner!);
      return Promise.all(
        owned.map(async (p) => {
          const [{ state, price, quoteUsd }, fees] = await Promise.all([
            getMarketPricing(p.market),
            getUncollectedFees(p).catch(() => ({ owed0: 0n, owed1: 0n })),
          ]);
          const pool = buildPool(p.market, state.sqrtPriceX96, state.tick, state.liquidity);
          const sdkPos = new Position({
            pool,
            tickLower: p.tickLower,
            tickUpper: p.tickUpper,
            liquidity: p.liquidity.toString(),
          });
          const c0 = p.market.baseIsCurrency0;
          const baseAmount = Number((c0 ? sdkPos.amount0 : sdkPos.amount1).toExact());
          const quoteAmount = Number((c0 ? sdkPos.amount1 : sdkPos.amount0).toExact());
          const baseOwed = Number(c0 ? fees.owed0 : fees.owed1) / 10 ** p.market.base.decimals;
          const quoteOwed = Number(c0 ? fees.owed1 : fees.owed0) / 10 ** p.market.quote.decimals;
          return {
            ...p,
            inRange: state.tick >= p.tickLower && state.tick < p.tickUpper,
            baseAmount,
            quoteAmount,
            price,
            quoteUsd,
            valueUsd: (baseAmount * price + quoteAmount) * quoteUsd,
            feesUsd: (baseOwed * price + quoteOwed) * quoteUsd,
            currentTick: state.tick,
            assetAmount: baseAmount,
            usdcAmount: quoteAmount,
          };
        }),
      );
    },
  });
}

/** Build (but don't send) the withdrawal, so the confirm sheet can show
 *  exactly what comes back before anything moves. */
export function usePlanWithdraw() {
  const owner = useActiveAddress();
  const { data: referral } = useReferral();
  return useMutation({
    mutationFn: async (position: OwnedPosition): Promise<WithdrawPlan> =>
      // tight tolerance: the slippage buffer is exactly what comes back as
      // dust, and blocks are ~250ms — worst case a revert + retry
      buildWithdrawPlan({ position, slippageBps: 25, owner, referrer: referral?.referrerWallet }),
  });
}

export function useWithdraw() {
  const send = useSendCalls();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ position, plan }: { position: OwnedPosition; plan: WithdrawPlan }) =>
      send(plan.calls, {
        description: `Withdraw position to ${position.market.quote.symbol}`,
        chainId: plan.chainId,
      }),
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
      playKaching();
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
      queryClient.invalidateQueries({ queryKey: ["cash-balances"] });
    },
  });
}
