import { createPublicClient, http, parseAbi, type PublicClient } from "viem";
import { CHAINS, chainConfig, type ChainId } from "./chain";
import { quoteUsdMarket, tickToQuotePrice, type Market } from "./markets";

const isServer = typeof window === "undefined";

/** Where RPC calls go.
 *
 *  Browser: our own /api/rpc/<chainId> proxy. Robinhood Chain's public RPC
 *  sends a malformed CORS header (`*,*`) that browsers reject, and the
 *  private Base/Alchemy endpoints are origin-allowlisted (vaults.cash only),
 *  so direct browser calls only ever worked from production on Base.
 *
 *  Server/build: the private URL from env (BASE_RPC_URL / ROBINHOOD_RPC_URL),
 *  else Alchemy, else the public RPC — with an explicit Origin header,
 *  because the allowlisted keys REJECT origin-less requests. Next inlines
 *  env vars only when the whole `process.env.X` expression is spelled out. */
function rpcUrl(chainId: ChainId): string | undefined {
  if (!isServer) return `${window.location.origin}/api/rpc/${chainId}`;
  const key = process.env.ALCHEMY_API_KEY;
  const alchemy = key ? `https://${chainConfig(chainId).alchemy}.g.alchemy.com/v2/${key}` : undefined;
  return chainId === 8453
    ? process.env.BASE_RPC_URL || alchemy || undefined
    : process.env.ROBINHOOD_RPC_URL || alchemy || undefined;
}

const clients = new Map<ChainId, PublicClient>();

export function publicClientFor(chainId: number): PublicClient {
  const cfg = chainConfig(chainId);
  const id = cfg.chain.id as ChainId;
  let c = clients.get(id);
  if (!c) {
    c = createPublicClient({
      chain: cfg.chain,
      transport: http(rpcUrl(id), {
        batch: { batchSize: 40, wait: 16 },
        retryCount: 3,
        ...(isServer ? { fetchOptions: { headers: { Origin: "https://vaults.cash" } } } : {}),
      }),
    });
    clients.set(id, c);
  }
  return c;
}

/** The Base client — for the few Base-only consumers. */
export const publicClient = publicClientFor(8453);

export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

export type PoolState = { sqrtPriceX96: bigint; tick: number; liquidity: bigint };

export async function getPoolState(market: Market): Promise<PoolState> {
  const client = publicClientFor(market.chainId);
  const stateView = CHAINS[market.chainId].uniswap.v4.stateView;
  const [slot0, liquidity] = await Promise.all([
    client.readContract({ address: stateView, abi: stateViewAbi, functionName: "getSlot0", args: [market.pool.poolId] }),
    client.readContract({ address: stateView, abi: stateViewAbi, functionName: "getLiquidity", args: [market.pool.poolId] }),
  ]);
  const [sqrtPriceX96, tick] = slot0;
  return { sqrtPriceX96, tick: Number(tick), liquidity };
}

/** Mid-price of `base` in `quote` units, derived from the pool tick. */
export function tickToPrice(market: Market, tick: number): number {
  return tickToQuotePrice(tick, market.baseIsCurrency0, market.base.decimals, market.quote.decimals);
}

export type MarketPricing = {
  state: PoolState;
  /** base in quote units */
  price: number;
  /** quote in dollars (1 when the quote is the stablecoin) */
  quoteUsd: number;
  /** base in dollars */
  priceUsd: number;
};

/** Pool state plus dollar pricing, reading the quote leg's stablecoin pool
 *  when the quote isn't the stablecoin itself. */
export async function getMarketPricing(market: Market): Promise<MarketPricing> {
  const q = quoteUsdMarket(market);
  const [state, qState] = await Promise.all([getPoolState(market), q ? getPoolState(q) : null]);
  const price = tickToPrice(market, state.tick);
  const quoteUsd = q && qState ? tickToPrice(q, qState.tick) : 1;
  return { state, price, quoteUsd, priceUsd: price * quoteUsd };
}

/** Pricing for many markets with each pool read exactly once (the quote
 *  legs' stablecoin pools are markets themselves). Markets whose reads fail
 *  are left out rather than failing the whole batch. */
export async function getPricingMap(markets: Market[]): Promise<Map<string, MarketPricing>> {
  const needed = new Map<string, Market>();
  for (const m of markets) {
    needed.set(m.slug, m);
    const q = quoteUsdMarket(m);
    if (q) needed.set(q.slug, q);
  }
  const states = new Map<string, PoolState>();
  await Promise.all(
    [...needed.values()].map(async (m) => {
      try {
        states.set(m.slug, await getPoolState(m));
      } catch {
        /* skipped below */
      }
    }),
  );
  const out = new Map<string, MarketPricing>();
  for (const m of markets) {
    const state = states.get(m.slug);
    if (!state) continue;
    const q = quoteUsdMarket(m);
    const qState = q ? states.get(q.slug) : undefined;
    if (q && !qState) continue;
    const price = tickToPrice(m, state.tick);
    const quoteUsd = q && qState ? tickToPrice(q, qState.tick) : 1;
    out.set(m.slug, { state, price, quoteUsd, priceUsd: price * quoteUsd });
  }
  return out;
}
