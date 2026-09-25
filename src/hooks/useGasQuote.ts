"use client";

import { useQuery } from "@tanstack/react-query";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { CHAINS, type ChainId } from "@/lib/chain";
import { gasTokenOf, withGasTokenApproval } from "@/lib/gasToken";
import type { Call } from "@/lib/zap";

export type GasQuote = { usd: number; tokenAmount: string; symbol: string };

/**
 * What a batch would cost in the chain's stablecoin under the ERC-20 gas
 * policy, for the review sheet. Encodes the batch exactly as it will be
 * sent (approval included) so the estimate matches. Resolves to null on
 * chains that don't charge gas in a token, or while the wallet isn't ready.
 */
export function useGasQuote(chainId: ChainId, calls: Call[] | null | undefined) {
  const { client, getClientForChain } = useSmartWallets();
  const enabled = !!gasTokenOf(chainId) && !!calls && calls.length > 0 && !!client;
  return useQuery<GasQuote | null>({
    queryKey: ["gas-quote", chainId, calls?.map((c) => c.to + c.data + c.value.toString()).join("|")],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const c = client && client.chain?.id === chainId ? client : await getClientForChain({ id: chainId });
      if (!c?.account) return null;
      const batch = withGasTokenApproval(chainId, calls!);
      const account = c.account;
      const [callData, nonce, factoryArgs] = await Promise.all([
        account.encodeCalls(batch.map((x) => ({ to: x.to, value: x.value, data: x.data }))),
        account.getNonce(),
        account.getFactoryArgs?.() ?? Promise.resolve(undefined),
      ]);
      const res = await fetch("/api/gas/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId,
          sender: account.address,
          nonce: `0x${nonce.toString(16)}`,
          callData,
          ...(factoryArgs?.factory && factoryArgs.factoryData ? { factory: factoryArgs.factory, factoryData: factoryArgs.factoryData } : {}),
        }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { usd?: number; tokenAmount?: string; symbol?: string };
      if (typeof j.usd !== "number") return null;
      return { usd: j.usd, tokenAmount: j.tokenAmount ?? "", symbol: j.symbol ?? CHAINS[chainId].quote.symbol };
    },
  });
}
