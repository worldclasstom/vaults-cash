import { createPublicClient, http, parseAbi } from "viem";
import { baseChain, UNISWAP } from "./chain";
import type { Market } from "./markets";

/** Coinbase CDP Base RPC on both sides.
 *
 *  Browser: NEXT_PUBLIC_BASE_RPC_URL is safe to ship because the CDP key is
 *  restricted by a domain allowlist (vaults.cash + localhost:3000) — the
 *  browser sends Origin automatically.
 *
 *  Server/build: the allowlist REJECTS requests with no Origin header, so
 *  server-side calls must present one explicitly. Without this, prerendering
 *  falls back to the public RPC and dies on rate limits. */
const isServer = typeof window === "undefined";
const rpcUrl =
  (isServer
    ? process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL
    : process.env.NEXT_PUBLIC_BASE_RPC_URL) || undefined;

export const publicClient = createPublicClient({
  chain: baseChain,
  transport: http(rpcUrl, {
    batch: true,
    retryCount: 3,
    ...(isServer ? { fetchOptions: { headers: { Origin: "https://vaults.cash" } } } : {}),
  }),
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
 * Mid-price of the market asset in USDC, derived from the pool tick.
 * 1.0001^tick is the raw currency1-per-currency0 price; whether that's the
 * asset price or its inverse depends on address-sort order.
 */
export function tickToUsdcPrice(market: Market, tick: number): number {
  const raw = Math.pow(1.0001, tick);
  const shift = Math.pow(10, market.tokenDecimals - 6);
  return market.assetIsCurrency0 ? raw * shift : shift / raw;
}
