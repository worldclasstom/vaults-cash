import registry from "./registry.json";

export type PoolRef = {
  poolId: `0x${string}`;
  /** v4 currencies, sorted; address(0) = native ETH */
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
};

export type Market = {
  /** display ticker, e.g. "cbBTC" */
  symbol: string;
  name: string;
  /** "stable" = paired against USDC with minimal price divergence (near-zero
   *  impermanent loss); "crypto" = volatile asset. Crypto-only product — no
   *  tokenized securities, so nothing here is geo-restricted. */
  kind: "crypto" | "stable";
  /** the non-USDC asset; address(0) = native ETH */
  token: `0x${string}`;
  tokenDecimals: number;
  pool: PoolRef;
  /** address-sort order varies per pool: true when the asset is currency0
   *  (USDC is currency1), false when USDC sorts first */
  assetIsCurrency0: boolean;
  color: string;
};

export const NATIVE_ETH = "0x0000000000000000000000000000000000000000" as const;

export const USDC = {
  address: registry.tokens.USDC.address as `0x${string}`,
  symbol: "USDC",
  decimals: 6,
} as const;

function toAddress(sym: string): `0x${string}` {
  if (sym === "ETH") return NATIVE_ETH;
  const t = registry.tokens[sym as keyof typeof registry.tokens];
  if (!t) throw new Error(`token ${sym} missing from registry`);
  return t.address as `0x${string}`;
}

function poolRef(pair: string, p: { poolId: string; fee: number; tickSpacing: number }): PoolRef {
  const [a, b] = pair.split("/").map(toAddress);
  const [currency0, currency1] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return { poolId: p.poolId as `0x${string}`, currency0, currency1, fee: p.fee, tickSpacing: p.tickSpacing };
}

/** The deepest (most-liquidity) USDC pool for a token, or null if every tier
 *  is empty. Fee tiers migrate as liquidity moves — a hardcoded tier silently
 *  breaks when it drains, so always resolve the live deepest pool from the
 *  registry instead. Tokens with no live pool simply aren't listed. */
function deepestUsdcPool(symbol: string): PoolRef | null {
  // the registry names ETH's own USDC pool "USDC/ETH" (scanner iterates
  // tokens-vs-ETH first); accept both orderings
  const names = symbol === "ETH" ? ["ETH/USDC", "USDC/ETH"] : [`${symbol}/USDC`];
  const best = registry.v4Pools
    .filter((p) => names.includes(p.pair) && BigInt(p.liquidity) > 0n)
    .sort((a, b) => (BigInt(b.liquidity) > BigInt(a.liquidity) ? 1 : -1))[0];
  return best ? poolRef(symbol === "ETH" ? "ETH/USDC" : `${symbol}/USDC`, best) : null;
}

function market(
  symbol: string,
  name: string,
  registryKey: keyof typeof registry.tokens,
  kind: Market["kind"],
  color: string,
): Market | null {
  const pool = deepestUsdcPool(registryKey);
  if (!pool) return null; // no live liquidity in any tier — don't list it
  const t = registry.tokens[registryKey];
  const token = t.address as `0x${string}`;
  return {
    symbol,
    name,
    kind,
    token,
    tokenDecimals: t.decimals,
    pool,
    assetIsCurrency0: pool.currency0.toLowerCase() === token.toLowerCase(),
    color,
  };
}

const ethPool = deepestUsdcPool("ETH")!; // flagship market; always has liquidity

export const MARKETS: Market[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    kind: "crypto",
    token: NATIVE_ETH,
    tokenDecimals: 18,
    pool: ethPool,
    assetIsCurrency0: ethPool.currency0 === NATIVE_ETH,
    color: "#8a92b2",
  },
  market("cbBTC", "Bitcoin", "cbBTC", "crypto", "#f7931a"),
  market("AERO", "Aerodrome", "AERO", "crypto", "#5b6ef5"),
  market("LINK", "Chainlink", "LINK", "crypto", "#2a5ada"),
  market("AAVE", "Aave", "AAVE", "crypto", "#b6509e"),
  market("DAI", "Dai", "DAI", "stable", "#f5ac37"),
  market("USDT", "Tether", "USDT", "stable", "#26a17b"),
].filter((m): m is Market => m !== null);

export const marketBySymbol = (symbol: string) =>
  MARKETS.find((m) => m.symbol.toLowerCase() === symbol.toLowerCase());
