"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { parseUnits } from "viem";
import { CHAINS, type ChainId } from "@/lib/chain";
import type { Market } from "@/lib/markets";
import { getPoolState } from "@/lib/onchain";
import { readPosition, type OwnedPosition } from "@/lib/positions";
import { buildLadderClosePlan, buildLadderCollectPlan, buildLadderPlan, type ClosePlan, type Direction, type LadderPlan } from "@/lib/targets";
import type { LadderView } from "@/lib/ladders";
import { playKaching } from "@/lib/sound";
import { useActiveAddress } from "./useChainData";
import { useReferral } from "./useReferral";
import { useSendCalls } from "./useSendCalls";
import { useAuth } from "@/components/AuthProvider";

function useAuthedFetch() {
  const { getAccessToken } = usePrivy();
  return async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const token = await getAccessToken();
    const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });
    const j = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(j.error ?? `request failed (${res.status})`);
    return j;
  };
}

export function useLadders() {
  const { authenticated } = useAuth();
  const authed = useAuthedFetch();
  return useQuery<LadderView[]>({
    queryKey: ["ladders"],
    enabled: authenticated,
    refetchInterval: 30_000,
    queryFn: async () => (await authed<{ ladders: LadderView[] }>("/api/targets")).ladders,
  });
}

export function useLadder(id: number | null) {
  const { authenticated } = useAuth();
  const authed = useAuthedFetch();
  return useQuery<LadderView>({
    queryKey: ["ladder", id],
    enabled: authenticated && id !== null,
    refetchInterval: 20_000,
    queryFn: async () => (await authed<{ ladder: LadderView }>(`/api/targets/${id}`)).ladder,
  });
}

/** Token ids that belong to ladders: Portfolio leaves them out. */
export function useLadderRungIds() {
  const { authenticated } = useAuth();
  const authed = useAuthedFetch();
  return useQuery<Set<string>>({
    queryKey: ["ladder-rung-ids"],
    enabled: authenticated,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await authed<{ rungs: Array<{ chainId: number; tokenId: string }> }>("/api/targets?ids=1");
      return new Set(r.rungs.map((x) => `${x.chainId}:${x.tokenId}`));
    },
  });
}

export type LadderInput = {
  market: Market;
  amountUsd: number;
  direction: Direction;
  targetPriceUsd: number;
  rungs: number;
  slippageBps: number;
};

export function usePlanLadder() {
  const owner = useActiveAddress();
  const { data: referral } = useReferral();
  return useMutation({
    mutationFn: async (input: LadderInput): Promise<LadderPlan> => {
      if (!owner) throw new Error("Wallet not ready yet — try again in a second.");
      const poolState = await getPoolState(input.market);
      const { decimals } = CHAINS[input.market.chainId].quote;
      return buildLadderPlan({
        market: input.market,
        owner,
        usdcAmount: parseUnits(input.amountUsd.toFixed(decimals), decimals),
        direction: input.direction,
        targetPriceUsd: input.targetPriceUsd,
        rungs: input.rungs,
        slippageBps: input.slippageBps,
        poolState,
        referrer: referral?.referrerWallet,
      });
    },
  });
}

/** Mint the rungs, then record the ladder from the receipt. Resolves with the ladder id. */
export function useSendLadder() {
  const send = useSendCalls();
  const owner = useActiveAddress();
  const authed = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ plan, market, amountUsd, autoClose, expiresAt }: { plan: LadderPlan; market: Market; amountUsd: number; autoClose: boolean; expiresAt: string | null }) => {
      if (!owner) throw new Error("Wallet not ready");
      const { hash } = await send(plan.calls, { description: "Set a target", chainId: plan.chainId });
      const r = await authed<{ id: number }>("/api/targets", {
        method: "POST",
        body: JSON.stringify({
          wallet: owner,
          chainId: plan.chainId,
          marketSlug: market.slug,
          direction: plan.direction,
          targetPrice: plan.targetPrice,
          targetTick: plan.targetTick,
          startTick: plan.startTick,
          startPrice: plan.priceNow,
          amountUsd,
          autoClose,
          expiresAt,
          txHash: hash,
          rungs: plan.rungs.map((r) => ({ idx: r.idx, tickLower: r.tickLower, tickUpper: r.tickUpper })),
        }),
      });
      return { id: r.id, hash };
    },
    onSuccess: () => {
      playKaching();
      qc.invalidateQueries({ queryKey: ["ladders"] });
      qc.invalidateQueries({ queryKey: ["ladder-rung-ids"] });
      qc.invalidateQueries({ queryKey: ["usdc-balance"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
    },
  });
}

async function livePositions(view: LadderView): Promise<OwnedPosition[]> {
  const ps = await Promise.all(view.rungs.filter((r) => r.live).map((r) => readPosition(view.chainId as ChainId, BigInt(r.tokenId))));
  return ps.filter(Boolean) as OwnedPosition[];
}

export function usePlanLadderClose() {
  const owner = useActiveAddress();
  const { data: referral } = useReferral();
  return useMutation({
    mutationFn: async ({ view, mode }: { view: LadderView; mode: "cash" | "keep" }): Promise<ClosePlan> => {
      if (!owner) throw new Error("Wallet not ready");
      const positions = await livePositions(view);
      return buildLadderClosePlan({ positions, owner, mode, slippageBps: 100, referrer: referral?.referrerWallet });
    },
  });
}

export function usePlanLadderCollect() {
  const owner = useActiveAddress();
  const { data: referral } = useReferral();
  return useMutation({
    mutationFn: async (view: LadderView): Promise<ClosePlan> => {
      if (!owner) throw new Error("Wallet not ready");
      const positions = await livePositions(view);
      return buildLadderCollectPlan({ positions, owner, slippageBps: 100, referrer: referral?.referrerWallet });
    },
  });
}

/** Send a close or collect plan and record it. */
export function useSendLadderAction() {
  const send = useSendCalls();
  const authed = useAuthedFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ view, plan, action }: { view: LadderView; plan: ClosePlan; action: "closed" | "collected" }) => {
      const { hash } = await send(plan.calls, { description: action === "closed" ? "Close target" : "Collect target fees", chainId: plan.chainId, proceedsPayGas: true });
      await authed(`/api/targets/${view.id}`, { method: "POST", body: JSON.stringify({ action, txHash: hash, feesUsd: Number(plan.feesEarnedStable) / 10 ** CHAINS[plan.chainId].quote.decimals }) });
      return hash;
    },
    onSuccess: () => {
      playKaching();
      qc.invalidateQueries({ queryKey: ["ladders"] });
      qc.invalidateQueries({ queryKey: ["ladder"] });
      qc.invalidateQueries({ queryKey: ["ladder-rung-ids"] });
      qc.invalidateQueries({ queryKey: ["usdc-balance"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
      qc.invalidateQueries({ queryKey: ["positions"] });
    },
  });
}

/** Whether this account has turned on agent access (the keeper can close ladders for it). */
export function useAgentAccessOn() {
  const { authenticated } = useAuth();
  const authed = useAuthedFetch();
  const configured = !!process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
  return useQuery<boolean>({
    queryKey: ["agent-access-on"],
    enabled: authenticated && configured,
    staleTime: 30_000,
    queryFn: async () => {
      const s = await authed<{ wallets?: { embedded?: { delegated?: boolean } } }>("/api/agent-access");
      return !!s.wallets?.embedded?.delegated;
    },
  });
}
