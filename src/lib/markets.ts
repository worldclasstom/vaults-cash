import { CHAINS, type ChainId, type QuoteToken } from "./chain";
import baseRegistry from "./registries/base.json";
import robinhoodRegistry from "./registries/robinhood.json";

export type PoolRef = {
  poolId: `0x${string}`;
  /** v4 currencies, sorted; address(0) = native ETH */
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
};

export type Market = {
  /** URL-safe unique id across chains: "eth" on Base, "eth-robinhood" on
   *  Robinhood Chain. Symbols alone collide once the same asset trades on
   *  two chains. */
  slug: string;
  /** display ticker, e.g. "cbBTC" */
  symbol: string;
  name: string;
  chainId: ChainId;
  /** the stablecoin this market is quoted in (USDC on Base, USDG on
   *  Robinhood Chain) — every "usdc" amount in the zap/withdraw engines is
   *  really an amount of this token */
  quote: QuoteToken;
  /** "stable" = paired against the quote stablecoin with minimal price
   *  divergence (near-zero impermanent loss); "crypto" = volatile asset.
   *  Crypto-only product — no tokenized securities, so nothing here is
   *  geo-restricted. */
  kind: "crypto" | "stable";
  /** the non-quote asset; address(0) = native ETH */
  token: `0x${string}`;
  tokenDecimals: number;
  pool: PoolRef;
  /** address-sort order varies per pool: true when the asset is currency0
   *  (quote is currency1), false when the quote sorts first */
  assetIsCurrency0: boolean;
  color: string;
};

export const NATIVE_ETH = "0x0000000000000000000000000000000000000000" as const;

/** Shape shared by every registries/*.json written by verify-chain.ts. */
type Registry = {
  chainId: number;
  tokens: Record<string, { address: string; decimals: number }>;
  v4Pools: Array<{ poolId: string; pair: string; fee: number; tickSpacing: number; liquidity: string }>;
};

type MarketSpec = [symbol: string, name: string, registryKey: string, kind: Market["kind"], color: string];

function buildMarkets(chainId: ChainId, registry: Registry, specs: MarketSpec[]): Market[] {
  const cfg = CHAINS[chainId];
  if (registry.chainId !== chainId) {
    throw new Error(`registry for chain ${chainId} was generated for chain ${registry.chainId}`);
  }
  const quoteSym = cfg.quote.symbol;

  const toAddress = (sym: string): `0x${string}` => {
    if (sym === "ETH") return NATIVE_ETH;
    const t = registry.tokens[sym];
    if (!t) throw new Error(`token ${sym} missing from chain ${chainId} registry`);
    return t.address as `0x${string}`;
  };

  /** The deepest (most-liquidity) quote pool for a token, or null if every
   *  tier is empty. Fee tiers migrate as liquidity moves — a hardcoded tier
   *  silently breaks when it drains, so always resolve the live deepest pool
   *  from the registry instead. Tokens with no live pool aren't listed. */
  const deepestQuotePool = (sym: string): PoolRef | null => {
    // the scanner names pairs in whichever order it probed them
    const names = [`${sym}/${quoteSym}`, `${quoteSym}/${sym}`];
    const best = registry.v4Pools
      .filter((p) => names.includes(p.pair) && BigInt(p.liquidity) > 0n)
      .sort((a, b) => (BigInt(b.liquidity) > BigInt(a.liquidity) ? 1 : -1))[0];
    if (!best) return null;
    const a = toAddress(sym);
    const b = cfg.quote.address;
    const [currency0, currency1] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
    return {
      poolId: best.poolId as `0x${string}`,
      currency0,
      currency1,
      fee: best.fee,
      tickSpacing: best.tickSpacing,
    };
  };

  const out: Market[] = [];
  for (const [symbol, name, registryKey, kind, color] of specs) {
    const pool = deepestQuotePool(registryKey);
    if (!pool) continue; // no live liquidity in any tier — don't list it
    const token = toAddress(registryKey);
    const tokenDecimals = registryKey === "ETH" ? 18 : registry.tokens[registryKey].decimals;
    out.push({
      slug: chainId === 8453 ? symbol.toLowerCase() : `${symbol.toLowerCase()}-${cfg.label.toLowerCase()}`,
      symbol,
      name,
      chainId,
      quote: cfg.quote,
      kind,
      token,
      tokenDecimals,
      pool,
      assetIsCurrency0: pool.currency0.toLowerCase() === token.toLowerCase(),
      color,
    });
  }
  return out;
}

const BASE_MARKETS = buildMarkets(8453, baseRegistry as Registry, [
  ["ETH", "Ethereum", "ETH", "crypto", "#8a92b2"],
  ["cbBTC", "Bitcoin", "cbBTC", "crypto", "#f7931a"],
  ["AERO", "Aerodrome", "AERO", "crypto", "#5b6ef5"],
  ["LINK", "Chainlink", "LINK", "crypto", "#2a5ada"],
  ["AAVE", "Aave", "AAVE", "crypto", "#b6509e"],
  ["DAI", "Dai", "DAI", "stable", "#f5ac37"],
  ["USDT", "Tether", "USDT", "stable", "#26a17b"],
]);

/** Robinhood Chain: crypto only. Its tokenized stocks (TSLA, NVDA, …) are
 *  ERC-8056 tokens Robinhood offers to EU customers, not US persons — listing
 *  them is a product/legal decision, not a plumbing one. Adding one is a
 *  single line here once that call is made. */
const ROBINHOOD_MARKETS = buildMarkets(4663, robinhoodRegistry as Registry, [
  ["ETH", "Ethereum", "ETH", "crypto", "#8a92b2"],
]);

export const MARKETS: Market[] = [...BASE_MARKETS, ...ROBINHOOD_MARKETS];

if (!MARKETS.some((m) => m.slug === "eth")) {
  throw new Error("flagship ETH/USDC market on Base has no live pool in the registry");
}

/** Look up by slug ("eth-robinhood") or, for back-compat, by bare symbol —
 *  which resolves to the Base market since those are listed first. */
export const marketBySymbol = (key: string): Market | undefined => {
  const k = key.toLowerCase();
  return MARKETS.find((m) => m.slug === k) ?? MARKETS.find((m) => m.symbol.toLowerCase() === k);
};
export const marketBySlug = marketBySymbol;

export const marketsOnChain = (chainId: number) => MARKETS.filter((m) => m.chainId === chainId);
