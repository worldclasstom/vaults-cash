"use client";

import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { publicClientFor } from "@/lib/onchain";
import { gasTokenContext, withGasTokenApproval } from "@/lib/gasToken";
import type { ChainId } from "@/lib/chain";
import type { Call } from "@/lib/zap";

/**
 * Sends a batch of calls as ONE atomic user operation from the user's Privy
 * smart wallet on the given chain. The smart wallet has the same address on
 * every chain; Privy picks the bundler/paymaster configured for that chain
 * in the dashboard. On a chain that charges gas in its stablecoin (see
 * gasToken in chain.ts) the batch gains the paymaster approval and the op
 * carries the ERC-20 paymaster context; everywhere else nothing changes.
 */
export function useSendCalls() {
  const { client, getClientForChain } = useSmartWallets();

  return async (
    calls: Call[],
    opts: { description: string; chainId: number; proceedsPayGas?: boolean },
  ): Promise<{ hash: `0x${string}`; atomic: boolean }> => {
    const chainId = opts.chainId as ChainId;
    const c =
      client && client.chain?.id === chainId ? client : await getClientForChain({ id: chainId });
    if (!c) {
      throw new Error("Your wallet isn't ready yet — try again in a second.");
    }

    const batch = withGasTokenApproval(chainId, calls);
    const paymasterContext = gasTokenContext(chainId, { proceedsPayGas: opts.proceedsPayGas });
    const hash = await c.sendTransaction({
      calls: batch.map((x) => ({ to: x.to, value: x.value, data: x.data })),
      ...(paymasterContext ? { paymasterContext } : {}),
    });
    await publicClientFor(chainId).waitForTransactionReceipt({ hash });
    return { hash, atomic: true };
  };
}
