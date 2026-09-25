import { createPublicClient, http, type Hex } from "viem";
import { toAccount } from "viem/accounts";
import { createPaymasterClient } from "viem/account-abstraction";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { CHAINS, chainConfig, type ChainId } from "./chain";
import { serverRpcUrl } from "./rpc";
import type { Call } from "./uniswap";
import { privyWallets } from "./agentAccess";

/**
 * Server-side execution from a user's OWN smart wallet.
 *
 * Privy's smart-wallet integration is browser-only, so on the server we
 * rebuild the same account: the embedded EOA (signing through Privy with the
 * session signer the user granted — the key never leaves Privy's enclave)
 * is the sole owner of a Kernel v3.1 account at index 0, which is exactly
 * how Privy derives the smart wallet. Verified: the derived address equals
 * the app's smart-wallet address. Bundler/paymaster per chain come from env,
 * mirroring the Privy dashboard's chain config.
 */

const BUNDLER_ENV: Record<ChainId, string> = { 8453: "BUNDLER_URL_8453", 4663: "BUNDLER_URL_4663" };

function bundlerUrl(chainId: ChainId): string {
  const explicit = process.env[BUNDLER_ENV[chainId]];
  if (explicit) return explicit;
  const key = process.env.ALCHEMY_API_KEY;
  if (chainId === 4663 && key) return `https://${chainConfig(4663).alchemy}.g.alchemy.com/v2/${key}`;
  throw new Error(`${BUNDLER_ENV[chainId]} not configured`);
}

/** The Kernel address Privy would derive for this signer (no signing needed). */
export async function derivedSmartWallet(chainId: ChainId, owner: `0x${string}`): Promise<`0x${string}`> {
  const publicClient = createPublicClient({ chain: CHAINS[chainId].chain, transport: http(serverRpcUrl(chainId)) });
  const signer = toAccount({
    address: owner,
    signMessage: async () => "0x" as Hex,
    signTransaction: async () => "0x" as Hex,
    signTypedData: async () => "0x" as Hex,
  });
  const entryPoint = getEntryPoint("0.7");
  const validator = await signerToEcdsaValidator(publicClient, { signer, entryPoint, kernelVersion: KERNEL_V3_1 });
  const account = await createKernelAccount(publicClient, { plugins: { sudo: validator }, entryPoint, kernelVersion: KERNEL_V3_1, index: 0n });
  return account.address;
}

export type ExecutionResult = { chainId: ChainId; userOpHash: Hex; txHash: Hex; smartWallet: `0x${string}` };

/**
 * Send `calls` as one user operation from the user's smart wallet on `chainId`.
 * Throws with a plain message when the user hasn't granted the session signer.
 */
export async function executeForUser(privyDid: string, chainId: ChainId, calls: Call[]): Promise<ExecutionResult> {
  const appID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const authKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
  if (!appID || !appSecret || !authKey) throw new Error("Server signer not configured (PRIVY_APP_SECRET / PRIVY_AUTHORIZATION_PRIVATE_KEY)");

  const { embedded, smartWallet } = await privyWallets(privyDid);
  if (!embedded) throw new Error("This account has no embedded wallet to act from.");
  if (!embedded.delegated) throw new Error("Agent access is not enabled for this account. Turn it on at vaults.cash/account → Agent access.");

  const privy = new PrivyClient({ appId: appID, appSecret });
  const signer = createViemAccount(privy, {
    walletId: embedded.id,
    address: embedded.address,
    authorizationContext: { authorization_private_keys: [authKey] },
  });

  const cfg = CHAINS[chainId];
  const publicClient = createPublicClient({ chain: cfg.chain, transport: http(serverRpcUrl(chainId)) });
  const entryPoint = getEntryPoint("0.7");
  const validator = await signerToEcdsaValidator(publicClient, { signer, entryPoint, kernelVersion: KERNEL_V3_1 });
  const account = await createKernelAccount(publicClient, { plugins: { sudo: validator }, entryPoint, kernelVersion: KERNEL_V3_1, index: 0n });
  if (smartWallet && account.address.toLowerCase() !== smartWallet.toLowerCase()) {
    throw new Error(`Derived wallet ${account.address} does not match the account's smart wallet ${smartWallet}`);
  }

  const url = bundlerUrl(chainId);
  const paymaster = cfg.gasSponsored ? createPaymasterClient({ transport: http(url) }) : undefined;
  const client = createKernelAccountClient({
    account,
    chain: cfg.chain,
    client: publicClient,
    bundlerTransport: http(url),
    ...(paymaster ? { paymaster } : {}),
  });
  const userOpHash = await client.sendUserOperation({
    calls: calls.map((c) => ({ to: c.to, value: c.value, data: c.data })),
  });
  const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash, timeout: 120_000 });
  if (!receipt.success) throw new Error(`User operation reverted (tx ${receipt.receipt.transactionHash})`);
  return { chainId, userOpHash, txHash: receipt.receipt.transactionHash, smartWallet: account.address };
}
