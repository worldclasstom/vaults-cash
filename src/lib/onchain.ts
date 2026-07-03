import { createPublicClient, http, parseAbi } from "viem";
import { robinhoodChain, UNISWAP } from "./chain";
import type { Market } from "./markets";

/** Browser uses the Alchemy endpoint (protected by its domain allowlist);
 *  server-side code uses the public RPC — Alchemy rejects origin-less
 *  requests once an allowlist is set. */
const rpcUrl =
  typeof window === "undefined"
    ? undefined
    : process.env.NEXT_PUBLIC_RPC_URL || undefined;

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(rpcUrl),
});

export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

export const STATE_VIEW = UNISWAP.v4.stateView as `0x${string}`;

export async function getPoolState(market: Market) {
  const [slot0, liquidity] = await Promise.all([
    publicClient.readContract({
      address: STATE_VIEW,
      abi: stateViewAbi,
      functionName: "getSlot0",
      args: [market.pool.poolId],
    }),
    publicClient.readContract({
      address: STATE_VIEW,
      abi: stateViewAbi,
      functionName: "getLiquidity",
      args: [market.pool.poolId],
    }),
  ]);
  const [sqrtPriceX96, tick] = slot0;
  return { sqrtPriceX96, tick: Number(tick), liquidity };
}

/**
 * Mid-price of the market asset in USDG, derived from the pool tick.
 * Both launch pools have USDG as currency1, so price(c1 per c0) is the
 * asset price directly; the decimal shift is 10^(assetDec - usdgDec).
 */
export function tickToUsdgPrice(market: Market, tick: number): number {
  const raw = Math.pow(1.0001, tick);
  return raw * Math.pow(10, market.tokenDecimals - 6);
}
