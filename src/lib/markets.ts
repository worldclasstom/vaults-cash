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

function poolFromRegistry(pair: string, fee: number): PoolRef {
  const p = registry.v4Pools.find((p) => p.pair === pair && p.fee === fee);
  if (!p) throw new Error(`pool ${pair}@${fee} missing from registry — rerun scripts/verify-chain.ts`);
  const [a, b] = pair.split("/").map((s) => {
    if (s === "ETH") return NATIVE_ETH;
    const t = registry.tokens[s as keyof typeof registry.tokens];
    if (!t) throw new Error(`token ${s} missing from registry`);
    return t.address as `0x${string}`;
  });
  const [currency0, currency1] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return { poolId: p.poolId as `0x${string}`, currency0, currency1, fee: p.fee, tickSpacing: p.tickSpacing };
}

function stock(
  symbol: string,
  name: string,
  registryKey: keyof typeof registry.tokens,
  fee: number,
  color: string,
): Market {
  const token = registry.tokens[registryKey].address as `0x${string}`;
  const pool = poolFromRegistry(`${registryKey}/USDG`, fee);
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

const ethPool = poolFromRegistry("ETH/USDG", 500);

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
  stock("TSLA", "Tesla", "TSLA", 50000, "#e82127"),
  stock("AAPL", "Apple", "AAPL", 50000, "#a2aaad"),
  stock("NVDA", "NVIDIA", "NVDA", 50000, "#76b900"),
  stock("AMD", "AMD", "AMD", 10000, "#ed1c24"),
  stock("QQQ", "Nasdaq-100 ETF", "QQQ", 10000, "#0091da"),
  stock("SPCX", "SpaceX", "SPCX", 10000, "#005288"),
  stock("SNDK", "Sandisk", "SNDK", 10000, "#6d2077"),
];

export const marketBySymbol = (symbol: string) =>
  MARKETS.find((m) => m.symbol.toLowerCase() === symbol.toLowerCase());
