"use client";

import { useSendTransaction } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { robinhoodChain } from "@/lib/chain";
import { publicClient } from "@/lib/onchain";
import type { Call } from "@/lib/zap";

/**
 * Execute a call batch with the best available wallet:
 *  1. Privy smart wallet (ERC-4337) — one atomic, sponsorable userOp.
 *     Requires smart-wallet chain config for 4663 in the Privy dashboard,
 *     which Privy doesn't offer yet ("reach out" per their docs).
 *  2. Fallback: the embedded EOA sends the calls as sequential transactions,
 *     waiting for each receipt so on-chain ordering holds. Not atomic — the
 *     UI must label it as N steps — and the wallet needs a little ETH for gas.
 */
export function useSendCalls() {
  const { getClientForChain } = useSmartWallets();
  const { sendTransaction } = useSendTransaction();

  return async (
    calls: Call[],
    opts: { description: string },
  ): Promise<{ hash: `0x${string}`; atomic: boolean }> => {
    try {
      const client = await getClientForChain({ id: robinhoodChain.id });
      if (client) {
        const hash = await client.sendTransaction(
          { calls },
          { uiOptions: { description: opts.description, buttonText: "Confirm" } },
        );
        return { hash, atomic: true };
      }
    } catch {
      /* smart wallets not configured for this chain — use the EOA path */
    }

    // Flip NEXT_PUBLIC_SPONSOR_GAS=1 to have vaults.cash pay gas via Privy's
    // native sponsorship (requires dashboard gas-config for chain 4663).
    const sponsor = process.env.NEXT_PUBLIC_SPONSOR_GAS === "1";
    let lastHash: `0x${string}` | undefined;
    for (const [i, call] of calls.entries()) {
      const { hash } = await sendTransaction(
        {
          to: call.to,
          value: call.value,
          data: call.data,
          chainId: robinhoodChain.id,
        },
        {
          sponsor,
          uiOptions: {
            description: `${opts.description} — step ${i + 1} of ${calls.length}`,
            buttonText: i === calls.length - 1 ? "Finish" : "Continue",
          },
        },
      );
      lastHash = hash as `0x${string}`;
      // sequence matters (approve -> swap -> mint); wait for inclusion
      await publicClient.waitForTransactionReceipt({ hash: lastHash });
    }
    if (!lastHash) throw new Error("No transactions were sent");
    return { hash: lastHash, atomic: false };
  };
}
