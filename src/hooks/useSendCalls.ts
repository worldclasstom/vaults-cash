"use client";

import {
  useSendTransaction,
  useSign7702Authorization,
  useWallets,
} from "@privy-io/react-auth";
import { http, type TypedDataDefinition } from "viem";
import {
  createBundlerClient,
  entryPoint08Address,
  toSimple7702SmartAccount,
} from "viem/account-abstraction";
import type { PrivateKeyAccount, SignedAuthorization } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { publicClient } from "@/lib/onchain";
import type { Call } from "@/lib/zap";

/**
 * Atomic path: the embedded EOA acts as an ERC-4337 sender at its own
 * address via EIP-7702 (EF's canonical Simple7702Account delegate, verified
 * deployed on 4663). UserOps go through Alchemy's bundler with the signed
 * authorization attached — Privy's signer can't send type-4 transactions
 * directly (it strips authorizationList; verified on-chain), but it CAN sign
 * the authorization and the EIP-712 userOp hash, which is all this needs.
 */
const DELEGATE = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;
const DELEGATION_CODE = ("0xef0100" + DELEGATE.slice(2)).toLowerCase();

const BUNDLER_URL = process.env.NEXT_PUBLIC_RPC_URL || "";

async function bundlerRpc(method: string, params: unknown[] = []) {
  const res = await fetch(BUNDLER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

let entryPointChecked: boolean | null = null;
async function bundlerSupportsEp08(): Promise<boolean> {
  if (entryPointChecked !== null) return entryPointChecked;
  const eps: string[] = await bundlerRpc("eth_supportedEntryPoints");
  console.info("[vaults] bundler entrypoints:", eps);
  entryPointChecked = eps.some(
    (e) => e.toLowerCase() === entryPoint08Address.toLowerCase(),
  );
  return entryPointChecked;
}

export function useSendCalls() {
  const { sendTransaction } = useSendTransaction();
  const { signAuthorization } = useSign7702Authorization();
  const { wallets } = useWallets();

  return async (
    calls: Call[],
    opts: { description: string },
  ): Promise<{ hash: `0x${string}`; atomic: boolean }> => {
    const embedded = wallets.find((w) => w.walletClientType === "privy");

    // --- 1. atomic userOp via Alchemy bundler (EP v0.8 + 7702) ---
    if (embedded && BUNDLER_URL) {
      try {
        if (!(await bundlerSupportsEp08()))
          throw new Error("bundler does not serve EntryPoint v0.8");

        const eoa = embedded.address as `0x${string}`;
        await embedded.switchChain(robinhoodChain.id);
        const provider = await embedded.getEthereumProvider();

        // viem only needs signTypedData from the owner (EP v0.8 userOps are
        // EIP-712); back it with Privy's provider.
        const owner = {
          address: eoa,
          type: "local",
          source: "custom",
          signTypedData: async (typedData: TypedDataDefinition) =>
            (await provider.request({
              method: "eth_signTypedData_v4",
              params: [eoa, JSON.stringify(typedData)],
            })) as `0x${string}`,
          signMessage: async ({ message }: { message: string }) =>
            (await provider.request({
              method: "personal_sign",
              params: [
                typeof message === "string" ? message : (message as { raw: string }).raw,
                eoa,
              ],
            })) as `0x${string}`,
        } as unknown as PrivateKeyAccount;

        const account = await toSimple7702SmartAccount({
          client: publicClient,
          owner,
          implementation: DELEGATE,
        });

        const bundlerClient = createBundlerClient({
          account,
          client: publicClient,
          transport: http(BUNDLER_URL),
          userOperation: {
            estimateFeesPerGas: async () => {
              const block = await publicClient.getBlock();
              let maxPriorityFeePerGas = 0n;
              try {
                maxPriorityFeePerGas = BigInt(
                  await bundlerRpc("rundler_maxPriorityFeePerGas"),
                );
              } catch {
                /* not rundler — keep 0 */
              }
              const base = block.baseFeePerGas ?? 100_000_000n;
              return {
                maxFeePerGas: base * 2n + maxPriorityFeePerGas,
                maxPriorityFeePerGas,
              };
            },
          },
        });

        // sign the 7702 authorization only if the delegation isn't installed
        const code = await publicClient.getCode({ address: eoa });
        const delegated = (code ?? "0x").toLowerCase() === DELEGATION_CODE;
        let authorization: SignedAuthorization | undefined;
        if (!delegated) {
          const nonce = await publicClient.getTransactionCount({ address: eoa });
          const auth = await signAuthorization({
            contractAddress: DELEGATE,
            chainId: robinhoodChain.id,
            nonce,
          });
          authorization = {
            address: DELEGATE,
            chainId: auth.chainId,
            nonce: auth.nonce,
            r: auth.r,
            s: auth.s,
            yParity: auth.yParity,
          } as SignedAuthorization;
        }

        const uoHash = await bundlerClient.sendUserOperation({
          calls: calls.map((c) => ({ to: c.to, value: c.value, data: c.data })),
          authorization,
        });
        const { receipt, success } =
          await bundlerClient.waitForUserOperationReceipt({ hash: uoHash });
        if (!success) throw new Error("userOp reverted on-chain");
        console.info("[vaults] atomic userOp mined:", receipt.transactionHash);
        return { hash: receipt.transactionHash, atomic: true };
      } catch (e) {
        console.warn("[vaults] atomic path failed, using sequential:", e);
      }
    }

    // --- 2. sequential fallback (also the external-wallet path) ---
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
