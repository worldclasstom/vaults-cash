import { parseAbi } from "viem";
import { CHAIN_IDS, chainConfig, type ChainId } from "./chain";
import { marketsOnChain, type Market } from "./markets";
import { publicClientFor } from "./onchain";

export const posmOf = (chainId: number) => chainConfig(chainId).uniswap.v4.positionManager;

export const posmAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns (PoolKey poolKey, uint256 info)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128 liquidity)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

export type OwnedPosition = {
  tokenId: bigint;
  market: Market;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
};

function toInt24(v: bigint): number {
  const n = Number(v & 0xffffffn);
  return n >= 0x800000 ? n - 0x1000000 : n;
}

/** v4-periphery PositionInfo packing: [poolId(200b) | tickUpper(24b) | tickLower(24b) | hasSubscriber(8b)] */
export function decodePositionInfo(info: bigint) {
  return {
    tickLower: toInt24(info >> 8n),
    tickUpper: toInt24(info >> 32n),
    truncatedPoolId: (info >> 56n).toString(16).padStart(50, "0"),
  };
}

function marketForTruncatedPoolId(chainId: ChainId, truncated: string): Market | undefined {
  return marketsOnChain(chainId).find(
    (m) => m.pool.poolId.slice(2, 52).toLowerCase() === truncated.toLowerCase(),
  );
}

const feeViewAbi = parseAbi([
  "function getFeeGrowthInside(bytes32 poolId, int24 tickLower, int24 tickUpper) view returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128)",
  "function getPositionInfo(bytes32 poolId, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)",
]);

const Q128 = 1n << 128n;
const U256 = (1n << 256n) - 1n;
/** fee growth counters wrap; subtraction is defined mod 2^256 */
const wrapSub = (a: bigint, b: bigint) => (a - b) & U256;

/** Uncollected trading fees for a position, in raw token units. */
export async function getUncollectedFees(position: OwnedPosition) {
  const { market, tokenId, tickLower, tickUpper } = position;
  const client = publicClientFor(market.chainId);
  const stateView = chainConfig(market.chainId).uniswap.v4.stateView;
  const salt = `0x${tokenId.toString(16).padStart(64, "0")}` as `0x${string}`;
  const [[fg0, fg1], [liquidity, fg0Last, fg1Last]] = await Promise.all([
    client.readContract({
      address: stateView,
      abi: feeViewAbi,
      functionName: "getFeeGrowthInside",
      args: [market.pool.poolId, tickLower, tickUpper],
    }),
    client.readContract({
      address: stateView,
      abi: feeViewAbi,
      functionName: "getPositionInfo",
      args: [market.pool.poolId, posmOf(market.chainId), tickLower, tickUpper, salt],
    }),
  ]);
  return {
    owed0: (liquidity * wrapSub(fg0, fg0Last)) / Q128,
    owed1: (liquidity * wrapSub(fg1, fg1Last)) / Q128,
  };
}

/** Candidate token ids: in the browser via our /api/positions/nfts route
 *  (indexer keys stay server-side), on the server directly. */
async function candidateTokenIds(owner: `0x${string}`, chainId: ChainId): Promise<bigint[]> {
  if (typeof window === "undefined") {
    const { positionTokenIds } = await import("./nfts");
    return positionTokenIds(chainId, owner);
  }
  const res = await fetch(`/api/positions/nfts?chainId=${chainId}&owner=${owner}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`positions lookup failed (${res.status})`);
  const body = (await res.json()) as { tokenIds: string[] };
  // indexers lag a freshly minted position by seconds — merge ids this
  // browser saw minted so a deposit shows up the moment its receipt lands
  const { knownPositions } = await import("./knownPositions");
  return [...new Set([...body.tokenIds.map(BigInt), ...knownPositions(chainId, owner)])];
}

/** Enumerate the user's v4 position NFTs on one chain, then read live state
 *  (ownership + liquidity) from the chain itself. */
export async function fetchPositionsOnChain(
  owner: `0x${string}`,
  chainId: ChainId,
): Promise<OwnedPosition[]> {
  const client = publicClientFor(chainId);
  const posm = posmOf(chainId);
  const tokenIds = await candidateTokenIds(owner, chainId);

  const positions = await Promise.all(
    tokenIds.map(async (tokenId) => {
      try {
        const [poolAndInfo, liquidity, currentOwner] = await Promise.all([
          client.readContract({ address: posm, abi: posmAbi, functionName: "getPoolAndPositionInfo", args: [tokenId] }),
          client.readContract({ address: posm, abi: posmAbi, functionName: "getPositionLiquidity", args: [tokenId] }),
          client.readContract({ address: posm, abi: posmAbi, functionName: "ownerOf", args: [tokenId] }),
        ]);
        // Blockscout lags on transfers/burns — trust the chain
        if (currentOwner.toLowerCase() !== owner.toLowerCase()) return null;
        if (liquidity === 0n) return null;
        const { tickLower, tickUpper, truncatedPoolId } = decodePositionInfo(poolAndInfo[1]);
        const market = marketForTruncatedPoolId(chainId, truncatedPoolId);
        if (!market) return null; // position in a pool we don't list
        return { tokenId, market, tickLower, tickUpper, liquidity };
      } catch {
        return null;
      }
    }),
  );
  return positions.filter((p): p is OwnedPosition => p !== null);
}

/** All of the user's positions across every supported chain. One chain's
 *  explorer being down hides that chain's positions, not everyone's. */
export async function fetchPositions(owner: `0x${string}`): Promise<OwnedPosition[]> {
  const results = await Promise.allSettled(
    CHAIN_IDS.map((chainId) => fetchPositionsOnChain(owner, chainId)),
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  if (ok.length === 0 && results.length > 0) {
    throw (results[0] as PromiseRejectedResult).reason;
  }
  return ok.flatMap((r) => r.value);
}
