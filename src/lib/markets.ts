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
  /** display ticker, e.g. "TSLA" */
  symbol: string;
  name: string;
  kind: "stock" | "crypto";
  /** the non-USDG asset; address(0) = native ETH */
  token: `0x${string}`;
  tokenDecimals: number;
  /** ERC-8056 scaled-UI tokens report a uiMultiplier (1e18 = 1.0) */
  hasUiMultiplier: boolean;
  pool: PoolRef;
  /** address-sort order varies per pool: true when the asset is currency0
   *  (USDG is currency1), false when USDG sorts first */
  assetIsCurrency0: boolean;
  /** stock tokens may not be offered to US persons */
  restricted: boolean;
  color: string;
};

export const NATIVE_ETH = "0x0000000000000000000000000000000000000000" as const;

export const USDG = {
  address: registry.tokens.USDG.address as `0x${string}`,
  symbol: "USDG",
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

/** The deepest (most-liquidity) USDG pool for a token, or null if every tier
 *  is empty. Fee tiers migrate on this young chain — a hardcoded tier silently
 *  breaks when liquidity moves (e.g. NVDA's 5% pool drained to zero), so we
 *  always resolve the live deepest pool from the registry instead. */
function deepestUsdgPool(symbol: string): PoolRef | null {
  const best = registry.v4Pools
    .filter((p) => p.pair === `${symbol}/USDG` && BigInt(p.liquidity) > 0n)
    .sort((a, b) => (BigInt(b.liquidity) > BigInt(a.liquidity) ? 1 : -1))[0];
  return best ? poolRef(`${symbol}/USDG`, best) : null;
}

function stock(
  symbol: string,
  name: string,
  registryKey: keyof typeof registry.tokens,
  color: string,
): Market | null {
  const pool = deepestUsdgPool(registryKey);
  if (!pool) return null; // no live liquidity in any tier — don't list it
  const token = registry.tokens[registryKey].address as `0x${string}`;
  return {
    symbol,
    name,
    kind: "stock",
    token,
    tokenDecimals: 18,
    hasUiMultiplier: true,
    pool,
    assetIsCurrency0: pool.currency0.toLowerCase() === token.toLowerCase(),
    restricted: true,
    color,
  };
}

const ethPool = deepestUsdgPool("ETH")!; // flagship market; always has liquidity

export const MARKETS: Market[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    kind: "crypto",
    token: NATIVE_ETH,
    tokenDecimals: 18,
    hasUiMultiplier: false,
    pool: ethPool,
    assetIsCurrency0: ethPool.currency0 === NATIVE_ETH,
    restricted: false,
    color: "#8a92b2",
  },
  stock("TSLA", "Tesla", "TSLA", "#e82127"),
  stock("NVDA", "NVIDIA", "NVDA", "#76b900"),
  stock("AAPL", "Apple", "AAPL", "#a2aaad"),
  stock("GOOGL", "Alphabet", "GOOGL", "#4285f4"),
  stock("META", "Meta", "META", "#0866ff"),
  stock("MSFT", "Microsoft", "MSFT", "#00a4ef"),
  stock("PLTR", "Palantir", "PLTR", "#6e7681"),
  stock("AMD", "AMD", "AMD", "#ed1c24"),
  stock("MU", "Micron", "MU", "#0071ce"),
  stock("QQQ", "Nasdaq-100 ETF", "QQQ", "#0091da"),
  stock("SPY", "S&P 500 ETF", "SPY", "#c99a3f"),
  stock("SPCX", "SpaceX", "SPCX", "#005288"),
  stock("SNDK", "Sandisk", "SNDK", "#6d2077"),
].filter((m): m is Market => m !== null);

export const marketBySymbol = (symbol: string) =>
  MARKETS.find((m) => m.symbol.toLowerCase() === symbol.toLowerCase());
