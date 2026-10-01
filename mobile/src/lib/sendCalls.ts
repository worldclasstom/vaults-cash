/** One atomic user operation from the Privy smart wallet, same rules as the web's useSendCalls:
 *  on a chain that charges gas in its stablecoin the batch gains the paymaster approval and the
 *  op carries Alchemy's ERC-20 context; everywhere else it is a plain sendTransaction. */
import { useSmartWallets } from "@privy-io/expo/smart-wallets";
import { publicClientFor } from "@web/lib/onchain";
import { gasTokenContext, withGasTokenApproval } from "@web/lib/gasToken";
import type { ChainId } from "@web/lib/chain";
import type { Call } from "@web/lib/zap";

export function useSendCalls() {
  const { client, getClientForChain } = useSmartWallets();

  return async (calls: Call[], opts: { chainId: number; proceedsPayGas?: boolean }): Promise<{ hash: `0x${string}` }> => {
    const chainId = opts.chainId as ChainId;
    const c = client && client.chain?.id === chainId ? client : await getClientForChain({ chainId });
    if (!c) throw new Error("Your wallet isn't ready yet. Try again in a second.");

    const batch = withGasTokenApproval(chainId, calls).map((x) => ({ to: x.to, value: x.value, data: x.data }));
    const paymasterContext = gasTokenContext(chainId, { proceedsPayGas: opts.proceedsPayGas });

    if (paymasterContext) {
      const raw = c as unknown as {
        sendUserOperation: (a: { calls: typeof batch; paymasterContext: unknown }) => Promise<`0x${string}`>;
        waitForUserOperationReceipt: (a: { hash: `0x${string}`; timeout?: number }) => Promise<{ success: boolean; receipt: { transactionHash: `0x${string}` } }>;
      };
      const userOpHash = await raw.sendUserOperation({ calls: batch, paymasterContext });
      const receipt = await raw.waitForUserOperationReceipt({ hash: userOpHash, timeout: 120_000 });
      if (!receipt.success) throw new Error("The transaction ran but reverted. Nothing moved beyond gas.");
      return { hash: receipt.receipt.transactionHash };
    }

    const hash = await c.sendTransaction({ calls: batch });
    await publicClientFor(chainId).waitForTransactionReceipt({ hash });
    return { hash };
  };
}
