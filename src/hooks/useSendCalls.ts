"use client";

import {
  useSendTransaction,
  useSign7702Authorization,
  useWallets,
} from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseAbi } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { publicClient } from "@/lib/onchain";
import type { Call } from "@/lib/zap";

/**
 * EF's canonical Simple7702Account delegate (audited, shipped with
 * EntryPoint v0.8) — verified deployed on Robinhood Chain 2026-07-03.
 * The embedded EOA delegates to it once, then executes call batches on
 * itself: atomic, no bundler, same address forever.
 */
const DELEGATE = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;
const DELEGATION_CODE = ("0xef0100" + DELEGATE.slice(2)).toLowerCase();

const delegateAbi = parseAbi([
  "struct Call { address target; uint256 value; bytes data; }",
  "function execute(address target, uint256 value, bytes data)",
  "function executeBatch(Call[] calls)",
]);

function encodeBatch(calls: Call[]): `0x${string}` {
  if (calls.length === 1) {
    return encodeFunctionData({
      abi: delegateAbi,
      functionName: "execute",
      args: [calls[0].to, calls[0].value, calls[0].data],
    });
  }
  return encodeFunctionData({
    abi: delegateAbi,
    functionName: "executeBatch",
    args: [calls.map((c) => ({ target: c.to, value: c.value, data: c.data }))],
  });
}

/**
 * Execute a call batch with the best available strategy:
 *  1. EIP-7702 self-executed batch from the embedded EOA — atomic, one
 *     confirmation, same address; first use includes the delegation.
 *  2. Sequential embedded-EOA transactions — non-atomic fallback (also the
 *     path for external wallets until they support batching).
 */
export function useSendCalls() {
  const { sendTransaction } = useSendTransaction();
  const { signAuthorization } = useSign7702Authorization();
  const { wallets } = useWallets();

  return async (
    calls: Call[],
    opts: { description: string },
  ): Promise<{ hash: `0x${string}`; atomic: boolean }> => {
    // --- 1. EIP-7702 atomic batch on the embedded EOA ---
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    if (embedded) {
      try {
        const eoa = embedded.address as `0x${string}`;
        await embedded.switchChain(robinhoodChain.id);
        const provider = await embedded.getEthereumProvider();
        const walletClient = createWalletClient({
          account: eoa,
          chain: robinhoodChain,
          transport: custom(provider),
        });

        const code = await publicClient.getCode({ address: eoa });
        const delegated = (code ?? "0x").toLowerCase() === DELEGATION_CODE;
        const data = encodeBatch(calls);

        const hash = delegated
          ? await walletClient.sendTransaction({ to: eoa, data, value: 0n })
          : await walletClient.sendTransaction({
              to: eoa,
              data,
              value: 0n,
              authorizationList: [
                await signAuthorization({
                  contractAddress: DELEGATE,
                  chainId: robinhoodChain.id,
                  executor: "self",
                }),
              ],
            });
        await publicClient.waitForTransactionReceipt({ hash });
        return { hash, atomic: true };
      } catch (e) {
        // Type-4 not yet supported end-to-end (provider/relay) — fall through
        // to the sequential path rather than dead-ending the user.
        console.warn("7702 batch failed, falling back to sequential:", e);
      }
    }

    // --- 2. sequential fallback ---
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
      await publicClient.waitForTransactionReceipt({ hash: lastHash });
    }
    if (!lastHash) throw new Error("No transactions were sent");
    return { hash: lastHash, atomic: false };
  };
}
