"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "viem";
import { USDG, type Market } from "@/lib/markets";
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
      return buildZapPlan({
        market: input.market,
        owner,
        usdgAmount: parseUnits(input.amountUsd.toFixed(USDG.decimals), USDG.decimals),
        preset: input.preset,
        customWidth: input.customWidth,
        slippageBps: input.slippageBps,
        poolState,
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
      sendCalls(plan.calls, { description: "Deposit into your liquidity position" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usdg-balance"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      // nudge the fee ledger so referral earnings show up immediately
      fetch("/api/referral/sync").catch(() => {});
    },
  });
}
