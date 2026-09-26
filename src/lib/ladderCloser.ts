/**
 * The LadderCloser contract (contracts/src/targets/LadderCloser.sol): the
 * adminless, permissionless auto-close for Targets. A ladder is registered
 * with it from the user's own wallet in the same batch that mints the rungs;
 * from then on anyone (in practice our keeper, a plain gas-paying account)
 * may call `close`, which only succeeds once every rung is fully crossed and
 * can only pay the rung owner, less the fixed fees.
 */
import { createWalletClient, decodeEventLog, encodeFunctionData, http, parseAbi, zeroAddress, type Log } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, type ChainId } from "./chain";
import { publicClientFor } from "./onchain";
import type { Call } from "./uniswap";

export const LADDER_CLOSER_ABI = parseAbi([
  "function registerLatest(uint256 count, bool higherTick, address referrer) returns (uint256 ladderId)",
  "function register(uint256[] tokenIds, bool higherTick, address referrer) returns (uint256 ladderId)",
  "function close(uint256 ladderId)",
  "function isClosable(uint256 ladderId) view returns (bool)",
  "function feeRecipient() view returns (address)",
  "function nextLadderId() view returns (uint256)",
  "event Registered(uint256 indexed ladderId, address indexed owner, address referrer, bool higherTick, uint256[] tokenIds)",
  "event Closed(uint256 indexed ladderId, address indexed caller, uint256 amount0ToOwner, uint256 amount1ToOwner, uint256 fee0, uint256 fee1)",
]);

const ERC721_ABI = parseAbi([
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
]);

/** The deployed closer on a chain, or undefined until it is deployed there. */
export function closerAddress(chainId: number): `0x${string}` | undefined {
  const v = chainId === 8453 ? process.env.NEXT_PUBLIC_LADDER_CLOSER_8453 : chainId === 4663 ? process.env.NEXT_PUBLIC_LADDER_CLOSER_4663 : undefined;
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) && v !== zeroAddress ? (v as `0x${string}`) : undefined;
}

/**
 * The calls that hand a freshly minted ladder to the contract, appended to
 * the mint batch: a one-time operator approval on the position NFT (skipped
 * when already granted) and the registration of the last `count` mints.
 */
export async function closerCalls(chainId: ChainId, owner: `0x${string}`, count: number, higherTick: boolean, referrer: `0x${string}` | null | undefined): Promise<Call[]> {
  const closer = closerAddress(chainId);
  if (!closer) return [];
  const posm = CHAINS[chainId].uniswap.v4.positionManager;
  const calls: Call[] = [];
  const approved = await publicClientFor(chainId)
    .readContract({ address: posm, abi: ERC721_ABI, functionName: "isApprovedForAll", args: [owner, closer] })
    .catch(() => false);
  if (!approved) calls.push({ to: posm, value: 0n, data: encodeFunctionData({ abi: ERC721_ABI, functionName: "setApprovalForAll", args: [closer, true] }) });
  const ref = referrer && referrer !== zeroAddress && referrer.toLowerCase() !== owner.toLowerCase() ? referrer : zeroAddress;
  calls.push({ to: closer, value: 0n, data: encodeFunctionData({ abi: LADDER_CLOSER_ABI, functionName: "registerLatest", args: [BigInt(count), higherTick, ref] }) });
  return calls;
}

/** The on-chain ladder id the receipt registered, if the batch included a registration. */
export function registeredLadderId(logs: Log[], closer: `0x${string}`): bigint | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== closer.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: LADDER_CLOSER_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "Registered") return ev.args.ladderId;
    } catch {
      /* another event */
    }
  }
  return null;
}

/** The keeper: a plain account that pays gas to call `close`. No other power. */
export function keeperAccount() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return null;
  return privateKeyToAccount(pk as `0x${string}`);
}

export async function isClosable(chainId: ChainId, ladderId: bigint): Promise<boolean> {
  const closer = closerAddress(chainId);
  if (!closer) return false;
  return publicClientFor(chainId).readContract({ address: closer, abi: LADDER_CLOSER_ABI, functionName: "isClosable", args: [ladderId] });
}

/** Close a registered ladder from the keeper account. Simulates first so a
 *  not-yet-crossed ladder costs nothing. Returns the tx hash. */
export async function keeperClose(chainId: ChainId, ladderId: bigint): Promise<`0x${string}`> {
  const closer = closerAddress(chainId);
  const account = keeperAccount();
  if (!closer) throw new Error("closer not deployed on this chain");
  if (!account) throw new Error("KEEPER_PRIVATE_KEY not set");
  const { serverRpcUrl } = await import("./rpc");
  const pub = publicClientFor(chainId);
  const wallet = createWalletClient({ account, chain: CHAINS[chainId].chain, transport: http(serverRpcUrl(chainId)) });
  const { request } = await pub.simulateContract({ account, address: closer, abi: LADDER_CLOSER_ABI, functionName: "close", args: [ladderId] });
  const hash = await wallet.writeContract(request);
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (rc.status !== "success") throw new Error(`close reverted: ${hash}`);
  return hash;
}
