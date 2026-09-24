"use client";

import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { publicClientFor } from "@/lib/onchain";
import type { Call } from "@/lib/zap";

/**
 * Sends a batch of calls as ONE atomic user operation from the user's Privy
 * smart wallet on the given chain. The smart wallet has the same address on
 * every chain; Privy picks the bundler/paymaster configured for that chain
 * in the dashboard, so gas sponsorship (or not) is decided there — nothing
 * to do here.
 */
export function useSendCalls() {
  const { client, getClientForChain } = useSmartWallets();

  return async (
    calls: Call[],
    opts: { description: string; chainId: number },
  ): Promise<{ hash: `0x${string}`; atomic: boolean }> => {
    const { chainId } = opts;
    const c =
      client && client.chain?.id === chainId ? client : await getClientForChain({ id: chainId });
    if (!c) {
      throw new Error("Your wallet isn't ready yet — try again in a second.");
    }

    const hash = await c.sendTransaction({
      calls: calls.map((x) => ({ to: x.to, value: x.value, data: x.data })),
    });
    await publicClientFor(chainId).waitForTransactionReceipt({ hash });
    return { hash, atomic: true };
  };
}
