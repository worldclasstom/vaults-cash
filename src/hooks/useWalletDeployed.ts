"use client";

import { useQuery } from "@tanstack/react-query";
import { publicClientFor } from "@/lib/onchain";
import { useActiveAddress } from "./useChainData";

/**
 * Whether the user's smart wallet has been deployed on a chain yet. The
 * first transaction on any chain also deploys the wallet, which is why it
 * costs more gas than the ones after it — the review sheet says so instead
 * of letting the first Robinhood quote read as "this app is expensive".
 * `undefined` while unknown.
 */
export function useWalletDeployed(chainId: number): boolean | undefined {
  const address = useActiveAddress();
  const { data } = useQuery({
    queryKey: ["wallet-deployed", chainId, address],
    enabled: !!address,
    staleTime: 60_000,
    queryFn: async () => {
      const code = await publicClientFor(chainId).getCode({ address: address! });
      return !!code && code !== "0x";
    },
  });
  return data;
}
