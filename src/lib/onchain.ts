import { createPublicClient, http, parseAbi, type PublicClient } from "viem";
import { CHAINS, chainConfig, type ChainId } from "./chain";
import type { Market } from "./markets";

const isServer = typeof window === "undefined";

/** Private RPC URLs per chain. Next inlines NEXT_PUBLIC_ vars only when the
 *  whole `process.env.X` expression is written out, so these can't be looked
 *  up dynamically by name.
 *
 *  Base = Coinbase CDP RPC on both sides. Browser: safe to ship because the
 *  CDP key is restricted by a domain allowlist (vaults.cash + localhost:3000)
 *  and the browser sends Origin automatically. Server/build: the allowlist
 *  REJECTS requests with no Origin header, so server-side calls present one
 *  explicitly — without it prerendering falls back to the public RPC and
 *  dies on rate limits.
 *
 *  Robinhood Chain = the public RPC unless an env override is set. */
const RPC_URLS: Record<ChainId, string | undefined> = {
  8453:
    (isServer ? process.env.BASE_RPC_URL : undefined) ||
    process.env.NEXT_PUBLIC_BASE_RPC_URL ||
    undefined,
  4663:
    (isServer ? process.env.ROBINHOOD_RPC_URL : undefined) ||
    process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ||
    undefined,
};

const clients = new Map<ChainId, PublicClient>();

export function publicClientFor(chainId: number): PublicClient {
  const cfg = chainConfig(chainId);
  const id = cfg.chain.id as ChainId;
  let c = clients.get(id);
  if (!c) {
    c = createPublicClient({
      chain: cfg.chain,
      transport: http(RPC_URLS[id], {
        batch: true,
        retryCount: 3,
        ...(isServer ? { fetchOptions: { headers: { Origin: "https://vaults.cash" } } } : {}),
      }),
    });
    clients.set(id, c);
  }
  return c;
}

/** The Base client — for the few Base-only consumers (fee-event scan). */
export const publicClient = publicClientFor(8453);

export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

export const stateViewOf = (chainId: number) => chainConfig(chainId).uniswap.v4.stateView;

export async function getPoolState(market: Market) {
  const client = publicClientFor(market.chainId);
  const stateView = CHAINS[market.chainId].uniswap.v4.stateView;
  const [slot0, liquidity] = await Promise.all([
    client.readContract({
      address: stateView,
      abi: stateViewAbi,
      functionName: "getSlot0",
      args: [market.pool.poolId],
    }),
    client.readContract({
      address: stateView,
      abi: stateViewAbi,
      functionName: "getLiquidity",
      args: [market.pool.poolId],
    }),
  ]);
  const [sqrtPriceX96, tick] = slot0;
  return { sqrtPriceX96, tick: Number(tick), liquidity };
}

/**
 * Mid-price of the market asset in its quote stablecoin, derived from the
 * pool tick. 1.0001^tick is the raw currency1-per-currency0 price; whether
 * that's the asset price or its inverse depends on address-sort order.
 */
export function tickToUsdcPrice(market: Market, tick: number): number {
  const raw = Math.pow(1.0001, tick);
  const shift = Math.pow(10, market.tokenDecimals - market.quote.decimals);
  return market.assetIsCurrency0 ? raw * shift : shift / raw;
}
