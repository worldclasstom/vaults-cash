"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "viem";
import type { Market } from "@/lib/markets";
import { getPoolState } from "@/lib/onchain";
import { buildZapPlan, type RangePreset, type ZapPlan } from "@/lib/zap";
import { useActiveAddress } from "./useChainData";
import { useSendCalls } from "./useSendCalls";

export type DepositInput = {
  market: Market;
  amountUsd: number;
  preset: RangePreset;
  customWidth?: number;
  slippageBps: number;
};

/** Step 1: build + quote the plan (shown on the confirm sheet). */
export function usePlanDeposit() {
  const owner = useActiveAddress();
  return useMutation({
    mutationFn: async (input: DepositInput): Promise<ZapPlan> => {
      if (!owner) throw new Error("Wallet not ready yet — try again in a second.");
      const poolState = await getPoolState(input.market);
      const { decimals } = input.market.quote;
      return buildZapPlan({
        market: input.market,
        owner,
        usdcAmount: parseUnits(input.amountUsd.toFixed(decimals), decimals),
        preset: input.preset,
        customWidth: input.customWidth,
        slippageBps: input.slippageBps,
        poolState,
      });
    },
  });
}

/** Build a plan that adds USDC to an EXISTING position (same range, no new
 *  NFT). The swap share is computed from the position's range at the current
 *  price, so out-of-center — even fully out-of-range — adds split correctly. */
export function usePlanAdd() {
  const owner = useActiveAddress();
  return useMutation({
    mutationFn: async (input: {
      position: { tokenId: bigint; tickLower: number; tickUpper: number; market: Market };
      amountUsd: number;
      slippageBps: number;
    }): Promise<ZapPlan> => {
      if (!owner) throw new Error("Wallet not ready yet — try again in a second.");
      const poolState = await getPoolState(input.position.market);
      const { decimals } = input.position.market.quote;
      return buildZapPlan({
        market: input.position.market,
        owner,
        usdcAmount: parseUnits(input.amountUsd.toFixed(decimals), decimals),
        preset: "full", // ignored — addTo's ticks win
        slippageBps: input.slippageBps,
        poolState,
        addTo: input.position,
      });
    },
  });
}

/** Step 2: execute the plan — atomic smart-wallet batch when available,
 *  sequential embedded-EOA transactions otherwise. */
export function useSendDeposit() {
  const sendCalls = useSendCalls();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: ZapPlan) =>
      sendCalls(plan.calls, {
        description: "Deposit into your liquidity position",
        chainId: plan.chainId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
      queryClient.invalidateQueries({ queryKey: ["cash-balances"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      // nudge the fee ledger so referral earnings show up immediately
      fetch("/api/referral/sync").catch(() => {});
    },
  });
}
