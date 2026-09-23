"use client";

import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { baseChain } from "@/lib/chain";
import { publicClient } from "@/lib/onchain";
import type { Call } from "@/lib/zap";

/**
 * Sends a batch of calls as ONE atomic user operation from the user's Privy
 * smart wallet. Gas sponsorship (or not) is decided by the paymaster
 * configured for the chain in the Privy dashboard — nothing to do here.
 *
 * `chainId` selects the smart-wallet client for that chain (Base today;
 * Robinhood Chain once it's configured in the dashboard), which is the hook
 * the cross-chain UX hangs off.
 */
export function useSendCalls() {
  const { client, getClientForChain } = useSmartWallets();

  return async (
    calls: Call[],
    opts: { description: string; chainId?: number },
  ): Promise<{ hash: `0x${string}`; atomic: boolean }> => {
    const chainId = opts.chainId ?? baseChain.id;
    const c =
      client && client.chain?.id === chainId ? client : await getClientForChain({ id: chainId });
    if (!c) {
      throw new Error("Your wallet isn't ready yet — try again in a second.");
    }

    const hash = await c.sendTransaction({
      calls: calls.map((x) => ({ to: x.to, value: x.value, data: x.data })),
    });
    if (chainId === baseChain.id) {
      await publicClient.waitForTransactionReceipt({ hash });
    }
    return { hash, atomic: true };
  };
}
