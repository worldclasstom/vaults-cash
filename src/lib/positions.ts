import { parseAbi } from "viem";
import { UNISWAP } from "./chain";
import { MARKETS, type Market } from "./markets";
import { publicClient } from "./onchain";
import { robinhoodChain } from "./chain";

export const POSM = UNISWAP.v4.positionManager as `0x${string}`;

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

function marketForTruncatedPoolId(truncated: string): Market | undefined {
  return MARKETS.find((m) => m.pool.poolId.slice(2, 52).toLowerCase() === truncated.toLowerCase());
}

/** Enumerate the user's v4 position NFTs via Blockscout, then read live state. */
export async function fetchPositions(owner: `0x${string}`): Promise<OwnedPosition[]> {
  const api = robinhoodChain.blockExplorers.default.apiUrl;
  const res = await fetch(`${api}/addresses/${owner}/nft?type=ERC-721`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 404) return []; // address unseen by the indexer yet
    throw new Error(`Blockscout ${res.status}`);
  }
  const body = await res.json();
  const tokenIds: bigint[] = (body.items ?? [])
    .filter((item: { token?: { address?: string; address_hash?: string } }) => {
      const addr = item.token?.address ?? item.token?.address_hash ?? "";
      return addr.toLowerCase() === POSM.toLowerCase();
    })
    .map((item: { id: string }) => BigInt(item.id));

  const positions = await Promise.all(
    tokenIds.map(async (tokenId) => {
      try {
        const [poolAndInfo, liquidity, currentOwner] = await Promise.all([
          publicClient.readContract({ address: POSM, abi: posmAbi, functionName: "getPoolAndPositionInfo", args: [tokenId] }),
          publicClient.readContract({ address: POSM, abi: posmAbi, functionName: "getPositionLiquidity", args: [tokenId] }),
          publicClient.readContract({ address: POSM, abi: posmAbi, functionName: "ownerOf", args: [tokenId] }),
        ]);
        // Blockscout lags on transfers/burns — trust the chain
        if (currentOwner.toLowerCase() !== owner.toLowerCase()) return null;
        if (liquidity === 0n) return null;
        const { tickLower, tickUpper, truncatedPoolId } = decodePositionInfo(poolAndInfo[1]);
        const market = marketForTruncatedPoolId(truncatedPoolId);
        if (!market) return null; // position in a pool we don't list
        return { tokenId, market, tickLower, tickUpper, liquidity };
      } catch {
        return null;
      }
    }),
  );
  return positions.filter((p): p is OwnedPosition => p !== null);
}
