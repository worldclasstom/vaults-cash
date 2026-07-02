"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { parseUnits } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { USDG, type Market } from "@/lib/markets";
import { getPoolState } from "@/lib/onchain";
import { buildZapPlan, type RangePreset, type ZapPlan } from "@/lib/zap";
import { useActiveAddress } from "./useChainData";

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

/** Step 2: send the batch as one sponsored userOp from the smart wallet. */
export function useSendDeposit() {
  const { getClientForChain } = useSmartWallets();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: ZapPlan): Promise<`0x${string}`> => {
      const client = await getClientForChain({ id: robinhoodChain.id });
      if (!client) throw new Error("Smart wallet unavailable — please re-login.");
      return client.sendTransaction(
        { calls: plan.calls },
        {
          uiOptions: {
            description: "Deposit into your liquidity position",
            buttonText: "Deposit",
          },
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usdg-balance"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
  });
}
