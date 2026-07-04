"use client";

import {
  useSendTransaction,
  useSign7702Authorization,
  useWallets,
} from "@privy-io/react-auth";
import { custom, type TypedDataDefinition } from "viem";
import {
  createBundlerClient,
  createPaymasterClient,
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

/**
 * viem encodes the ERC-7702 userOp factory marker as compact "0x7702";
 * Alchemy's rundler rejects that as "wrong address length" (verified on the
 * second live deposit attempt). Rewrite to the padded 20-byte marker, with
 * field-omission as the fallback encoding; remember whichever works.
 */
const FACTORY_MARKER = "0x7702";
const FACTORY_PADDED = "0x7702000000000000000000000000000000000000";
let factoryMode: "padded" | "omit" | null = null;

type WireUserOp = Record<string, unknown> & { factory?: string; factoryData?: string };

function rewriteOp(op: WireUserOp, mode: "padded" | "omit"): WireUserOp {
  const out = { ...op };
  if (mode === "padded") out.factory = FACTORY_PADDED;
  else {
    delete out.factory;
    delete out.factoryData;
  }
  return out;
}

async function bundlerRequest({ method, params }: { method: string; params?: unknown }) {
  const p = (params ?? []) as unknown[];
  const isUserOpCall =
    method === "eth_estimateUserOperationGas" || method === "eth_sendUserOperation";
  const op = isUserOpCall ? (p[0] as WireUserOp | undefined) : undefined;

  if (op && op.factory === FACTORY_MARKER) {
    const modes: Array<"padded" | "omit"> = factoryMode ? [factoryMode] : ["padded", "omit"];
    let lastError: unknown;
    for (const mode of modes) {
      try {
        const result = await bundlerRpc(method, [rewriteOp(op, mode), ...p.slice(1)]);
        factoryMode = mode;
        return result;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }
  return bundlerRpc(method, p);
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
              params: [
                eoa,
                // userOp typed data carries BigInts; encode them as decimal
                // strings (valid for eth_signTypedData_v4 uint fields)
                JSON.stringify(typedData, (_, v) =>
                  typeof v === "bigint" ? v.toString() : v,
                ),
              ],
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

        // Alchemy Gas Manager sponsorship (ERC-7677) — active when a policy
        // id is configured; swaps to a USDG paymaster policy later without
        // code changes.
        const policyId = process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID;
        const bundlerClient = createBundlerClient({
          account,
          client: publicClient,
          transport: custom({ request: bundlerRequest }),
          ...(policyId
            ? {
                paymaster: createPaymasterClient({
                  transport: custom({ request: bundlerRequest }),
                }),
                paymasterContext: { policyId },
              }
            : {}),
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
          // Privy returns yParity/chainId/nonce in loosely-typed encodings
          // (yParity arrived as a 32-byte padded hex once — Alchemy rejected
          // it). Normalize every numeric field explicitly.
          authorization = {
            address: DELEGATE,
            chainId: Number(BigInt(auth.chainId)),
            nonce: Number(BigInt(auth.nonce)),
            r: auth.r,
            s: auth.s,
            yParity: Number(BigInt(auth.yParity ?? auth.v)) % 2,
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
