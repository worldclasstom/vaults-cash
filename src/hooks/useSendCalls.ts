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

    const batch = withGasTokenApproval(chainId, calls).map((x) => ({ to: x.to, value: x.value, data: x.data }));
    const paymasterContext = gasTokenContext(chainId, { proceedsPayGas: opts.proceedsPayGas });

    if (paymasterContext) {
      // Privy's sendTransaction wrapper rebuilds the request and drops any
      // paymasterContext (verified in @privy-io/react-auth 3.45), so the
      // dashboard's policy-only context would reach Alchemy and the ERC-20
      // policy would reject it. The wrapped client still spreads viem's
      // bundler actions, so send the user operation directly with our context.
      const raw = c as unknown as {
        sendUserOperation: (a: { calls: typeof batch; paymasterContext: unknown }) => Promise<`0x${string}`>;
        waitForUserOperationReceipt: (a: { hash: `0x${string}`; timeout?: number }) => Promise<{ success: boolean; receipt: { transactionHash: `0x${string}` } }>;
      };
      const userOpHash = await raw.sendUserOperation({ calls: batch, paymasterContext });
      const receipt = await raw.waitForUserOperationReceipt({ hash: userOpHash, timeout: 120_000 });
      if (!receipt.success) throw new Error("The transaction ran but reverted — nothing was deposited or charged beyond gas.");
      return { hash: receipt.receipt.transactionHash, atomic: true };
    }

    const hash = await c.sendTransaction({ calls: batch });
    await publicClientFor(chainId).waitForTransactionReceipt({ hash });
    return { hash, atomic: true };
  };
}
