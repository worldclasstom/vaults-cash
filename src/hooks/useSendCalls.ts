"use client";

import { useCurrentUser, useSendUserOperation } from "@coinbase/cdp-hooks";
import { getUserOperation } from "@coinbase/cdp-core";
import type { Call } from "@/lib/zap";

/**
 * Sends a batch of calls as ONE atomic ERC-4337 user operation from the user's
 * CDP smart account, with gas sponsored by the CDP Paymaster on Base.
 *
 * This replaced ~270 lines of Privy+Alchemy workarounds (EIP-7702
 * authorization signing, a rundler factory-marker shim, BigInt-safe
 * signTypedData, and a nonce-race retry in a sequential fallback). None of it
 * is needed here: CDP smart accounts batch natively, so the whole zap
 * (fee + approvals + swap + mint) either all lands or all reverts.
 */
const NETWORK = "base" as const;
/** ~2s blocks on Base; 60 tries ≈ 60s, far past normal inclusion */
const POLL_TRIES = 60;
const POLL_MS = 1000;

export function useSendCalls() {
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();

  return async (
    calls: Call[],
    _opts: { description: string },
  ): Promise<{ hash: `0x${string}`; atomic: boolean }> => {
    // evmSmartAccountObjects, not the deprecated evmSmartAccounts
    const evmSmartAccount = currentUser?.evmSmartAccountObjects?.[0]?.address as
      | `0x${string}`
      | undefined;
    if (!evmSmartAccount) {
      throw new Error("Your wallet isn't ready yet — try again in a second.");
    }

    const { userOperationHash } = await sendUserOperation({
      evmSmartAccount,
      network: NETWORK,
      // cdp-core's EvmCall takes value as a bigint in wei. (Two SDK JSDoc
      // examples disagree with the types — `evmAccount` and a string value
      // are both wrong; the compiler is the source of truth here.)
      calls: calls.map((c) => ({ to: c.to, value: c.value ?? 0n, data: c.data })),
      useCdpPaymaster: true, // gasless: the user needs no ETH
    });

    // Wait for inclusion — the tx hash only exists once it's in a block.
    for (let i = 0; i < POLL_TRIES; i++) {
      const op = await getUserOperation({
        userOperationHash,
        evmSmartAccount,
        network: NETWORK,
      });
      if (op.status === "complete" && op.transactionHash) {
        return { hash: op.transactionHash as `0x${string}`, atomic: true };
      }
      if (op.status === "failed" || op.status === "dropped") {
        throw new Error(`Transaction ${op.status} on-chain — nothing was charged.`);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new Error(
      "Still waiting on confirmation. Check your portfolio in a moment — it may still land.",
    );
  };
}
