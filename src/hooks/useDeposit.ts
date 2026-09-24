"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseAbiItem, parseEventLogs, parseUnits } from "viem";
import { rememberPosition } from "@/lib/knownPositions";
import type { Market } from "@/lib/markets";
import { getPoolState, publicClientFor } from "@/lib/onchain";
import { posmOf } from "@/lib/positions";
import { buildZapPlan, type RangePreset, type ZapPlan } from "@/lib/zap";

const ERC721_TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);
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
  const owner = useActiveAddress();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: ZapPlan) => {
      const result = await sendCalls(plan.calls, {
        description: "Deposit into your liquidity position",
        chainId: plan.chainId,
      });
      // remember the minted position id locally so Portfolio shows it before
      // the NFT indexer has caught up (a fresh mint = Transfer from 0x0)
      try {
        const receipt = await publicClientFor(plan.chainId).getTransactionReceipt({ hash: result.hash });
        const posm = posmOf(plan.chainId).toLowerCase();
        for (const log of parseEventLogs({ abi: [ERC721_TRANSFER], logs: receipt.logs, eventName: "Transfer" })) {
          if (log.address.toLowerCase() === posm && owner && log.args.to.toLowerCase() === owner.toLowerCase()) {
            rememberPosition(plan.chainId, owner, log.args.tokenId);
          }
        }
      } catch {
        /* best effort — the indexer catches up within a minute regardless */
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
      queryClient.invalidateQueries({ queryKey: ["cash-balances"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      // nudge the fee ledger so referral earnings show up immediately
      fetch("/api/referral/sync").catch(() => {});
    },
  });
}
