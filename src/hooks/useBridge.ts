"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BridgeQuote, BridgeStatus } from "@/lib/bridge";
import type { ChainId } from "@/lib/chain";
import { useSendCalls } from "./useSendCalls";
import { useActiveAddress } from "./useChainData";

export function useBridgeQuote() {
  const user = useActiveAddress();
  return useMutation({
    mutationFn: async ({ from, to, amount }: { from: ChainId; to: ChainId; amount: bigint }): Promise<BridgeQuote> => {
      if (!user) throw new Error("Wallet not ready yet — try again in a second.");
      const res = await fetch("/api/bridge/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from, to, amount: amount.toString(), user }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Couldn't get a route");
      return j as BridgeQuote;
    },
  });
}

/** Sends the route as one user op on the source chain; resolves with the Relay request id to track. */
export function useSendBridge() {
  const send = useSendCalls();
  return useMutation({
    mutationFn: async (q: BridgeQuote) => {
      await send(
        q.calls.map((c) => ({ to: c.to, value: BigInt(c.value), data: c.data })),
        { description: `Move ${q.fromSymbol} to the other chain`, chainId: q.chainId },
      );
      return q.requestId;
    },
  });
}

const DONE: BridgeStatus[] = ["success", "failure", "refund"];

/** Polls Relay until the funds land; refreshes balances when they do. */
export function useBridgeStatus(requestId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["bridge-status", requestId],
    enabled: !!requestId,
    refetchInterval: (q) => (q.state.data && DONE.includes(q.state.data.status) ? false : 3_000),
    queryFn: async () => {
      const res = await fetch(`/api/bridge/status?requestId=${requestId}`);
      const j = (await res.json()) as { status: BridgeStatus; txHashes: string[] };
      if (j.status === "success") {
        qc.invalidateQueries({ queryKey: ["usdc-balance"] });
        qc.invalidateQueries({ queryKey: ["cash-balances"] });
      }
      return j;
    },
  });
}
