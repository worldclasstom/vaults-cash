import { CHAINS, type ChainId } from "./chain";
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

export type TokenKind = "stable" | "crypto" | "stock";
/** what a token's price tracks — two legs that track the same thing make a
 *  low-impermanent-loss pair (USDT/USDC, wstETH/ETH) */
export type Correlation = "usd" | "eth" | null;

export type TokenInfo = {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  kind: TokenKind;
  correlates: Correlation;
  /** ERC-8056 scaled-UI multiplier (1.0 = none). Pools trade RAW units, so
   *  all engine math stays raw; only displayed share counts and per-share
   *  prices apply it: shares = raw × m, price/share = rawPrice ÷ m. */
  uiMultiplier: number;
  color: string;
  logo?: string;
};

/**
 * A market is one Uniswap v4 pool, identified as a pair: `base` priced in
 * `quote`. The quote is always the more money-like leg (the chain's dollar
 * stablecoin, then ETH, then cbBTC), so ETH/USDC, cbBTC/ETH and TSLA/ETH all
 * read the way traders expect. Deposits and withdrawals are always in the
 * chain's stablecoin; when the quote isn't that stablecoin the zap converts
 * through the quote's own stablecoin pool (`quoteUsdSlug`).
 */
export type Market = {
  /** URL path under /market/: "base/eth-usdc", "robinhood/tsla-eth" */
  slug: string;
  chainId: ChainId;
  base: TokenInfo;
  quote: TokenInfo;
  /** quote is the chain's deposit stablecoin (USDC / USDG) */
  quoteIsStable: boolean;
  /** market whose pool prices `quote` in the stablecoin; undefined when
   *  quote already is the stablecoin */
  quoteUsdSlug?: string;
  pool: PoolRef;
  /** address-sort order varies per pool: true when base is currency0 */
  baseIsCurrency0: boolean;
  /** category for filters: stock if either leg is a stock token, stable if
   *  both legs are dollar-tracking, otherwise crypto */
  kind: TokenKind;
  /** both legs track the same thing — near-zero impermanent loss */
  lowIl: boolean;

  // ---- aliases kept from the single-asset era; base-leg shorthands ----
  symbol: string;
  name: string;
  token: `0x${string}`;
  tokenDecimals: number;
  uiMultiplier: number;
  assetIsCurrency0: boolean;
  color: string;
};

export const NATIVE_ETH = "0x0000000000000000000000000000000000000000" as const;

/** Shape shared by every registries/*.json written by verify-chain.ts. */
type Registry = {
  chainId: number;
  tokens: Record<
    string,
    { address: string; name: string; decimals: number; uiMultiplier?: string | null; logo?: string | null }
  >;
  v4Pools: Array<{ poolId: string; pair: string; fee: number; tickSpacing: number; tick: number; liquidity: string }>;
};

/** Presentation + classification for tokens we know. Anything else in the
 *  registry with a live pool is still listed with its on-chain name, kind
 *  "crypto" and a hashed color. Order here is display order. */
type Known = { name: string; kind: TokenKind; color: string; correlates?: Correlation };
const KNOWN: Record<string, Known> = {
  ETH: { name: "Ethereum", kind: "crypto", color: "#8a92b2", correlates: "eth" },
  USDC: { name: "USD Coin", kind: "stable", color: "#2775ca", correlates: "usd" },
  USDG: { name: "Global Dollar", kind: "stable", color: "#1e5eff", correlates: "usd" },
  cbBTC: { name: "Bitcoin", kind: "crypto", color: "#f7931a" },
  cbXRP: { name: "XRP", kind: "crypto", color: "#23292f" },
  cbETH: { name: "Coinbase Staked ETH", kind: "crypto", color: "#0052ff", correlates: "eth" },
  wstETH: { name: "Lido Staked ETH", kind: "crypto", color: "#00a3ff", correlates: "eth" },
  rETH: { name: "Rocket Pool ETH", kind: "crypto", color: "#f7a600", correlates: "eth" },
  weETH: { name: "EtherFi Staked ETH", kind: "crypto", color: "#6c4ff7", correlates: "eth" },
  AERO: { name: "Aerodrome", kind: "crypto", color: "#5b6ef5" },
  LINK: { name: "Chainlink", kind: "crypto", color: "#2a5ada" },
  AAVE: { name: "Aave", kind: "crypto", color: "#b6509e" },
  VIRTUAL: { name: "Virtuals", kind: "crypto", color: "#22c55e" },
  DEGEN: { name: "Degen", kind: "crypto", color: "#a36efd" },
  DAI: { name: "Dai", kind: "stable", color: "#f5ac37", correlates: "usd" },
  USDT: { name: "Tether", kind: "stable", color: "#26a17b", correlates: "usd" },
  EURC: { name: "Euro Coin", kind: "crypto", color: "#2775ca" },
  // Robinhood Chain stock tokens
  TSLA: { name: "Tesla", kind: "stock", color: "#e82127" },
  NVDA: { name: "NVIDIA", kind: "stock", color: "#76b900" },
  AAPL: { name: "Apple", kind: "stock", color: "#a2aaad" },
  GOOGL: { name: "Alphabet", kind: "stock", color: "#4285f4" },
  META: { name: "Meta", kind: "stock", color: "#0866ff" },
  MSFT: { name: "Microsoft", kind: "stock", color: "#00a4ef" },
  AMZN: { name: "Amazon", kind: "stock", color: "#ff9900" },
  PLTR: { name: "Palantir", kind: "stock", color: "#6e7681" },
  AMD: { name: "AMD", kind: "stock", color: "#ed1c24" },
  INTC: { name: "Intel", kind: "stock", color: "#0071c5" },
  MU: { name: "Micron", kind: "stock", color: "#0071ce" },
  ORCL: { name: "Oracle", kind: "stock", color: "#f80000" },
  COIN: { name: "Coinbase", kind: "stock", color: "#0052ff" },
  CRCL: { name: "Circle", kind: "stock", color: "#2775ca" },
  CRWV: { name: "CoreWeave", kind: "stock", color: "#111827" },
  SNDK: { name: "Sandisk", kind: "stock", color: "#6d2077" },
  SPCX: { name: "SpaceX", kind: "stock", color: "#005288" },
  USAR: { name: "USA Rare Earth", kind: "stock", color: "#b45309" },
  BABA: { name: "Alibaba", kind: "stock", color: "#ff6a00" },
  BE: { name: "Bloom Energy", kind: "stock", color: "#1d4ed8" },
  QQQ: { name: "Nasdaq-100 ETF", kind: "stock", color: "#0091da" },
  SPY: { name: "S&P 500 ETF", kind: "stock", color: "#c99a3f" },
  SLV: { name: "Silver ETF", kind: "stock", color: "#9ca3af" },
  SGOV: { name: "0-3 Month Treasury ETF", kind: "stock", color: "#374151" },
  USO: { name: "US Oil Fund", kind: "stock", color: "#7c2d12" },
};
const ETH_LOGO = "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png";
const KNOWN_ORDER = Object.keys(KNOWN);
const order = (sym: string) => {
  const i = KNOWN_ORDER.indexOf(sym);
  return i === -1 ? 1e9 : i;
};

/** Which leg is the quote: lower rank wins. */
function quoteRank(t: TokenInfo, stable: `0x${string}`): number {
  if (t.address.toLowerCase() === stable.toLowerCase()) return 0;
  if (t.kind === "stable") return 1;
  if (t.address === NATIVE_ETH) return 2;
  if (t.symbol === "cbBTC") return 3;
  return 9;
}

function hashColor(sym: string): string {
  let h = 0;
  for (const ch of sym) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

/** Robinhood token names read "Tesla • Robinhood Token" on-chain. */
const cleanName = (n: string) => n.split("•")[0].trim();

/** Dust floor for auto-listing, in virtual quote-side dollars: with
 *  liquidity L at sqrt-price √P the quote reserve of an equivalent full-range
 *  position is L·√P (quote = currency1) or L/√P (quote = currency0). Real
 *  concentrated pools hold less than that, so this is generous — e.g.
 *  SLV/USDG (L≈2e13) works out to ~$175 and can't even fill a $20 quote. The
 *  real "too thin to LP" gate is the GeckoTerminal TVL check in /api/stats. */
const MIN_VIRTUAL_QUOTE_USD = 1_000;

function virtualQuoteUnits(liquidity: string, tick: number, quoteIsCurrency1: boolean, quoteDecimals: number) {
  const sqrtP = Math.pow(1.0001, tick / 2);
  const L = Number(liquidity);
  return (quoteIsCurrency1 ? L * sqrtP : L / sqrtP) / 10 ** quoteDecimals;
}

/** Base price in quote units from a tick, for the given sort order. */
export function tickToQuotePrice(tick: number, baseIsCurrency0: boolean, baseDecimals: number, quoteDecimals: number) {
  const raw = Math.pow(1.0001, tick);
  const shift = Math.pow(10, baseDecimals - quoteDecimals);
  return baseIsCurrency0 ? raw * shift : shift / raw;
}

function buildMarkets(chainId: ChainId, registry: Registry): Market[] {
  const cfg = CHAINS[chainId];
  if (registry.chainId !== chainId) {
    throw new Error(`registry for chain ${chainId} was generated for chain ${registry.chainId}`);
  }
  const stable = cfg.quote.address;

  // token universe: native ETH + every registry token except WETH (same asset)
  const tokens = new Map<string, TokenInfo>();
  const toInfo = (sym: string): TokenInfo => {
    const known = KNOWN[sym];
    const reg = registry.tokens[sym];
    const isEth = sym === "ETH";
    return {
      address: isEth ? NATIVE_ETH : (reg.address as `0x${string}`),
      symbol: sym,
      name: known?.name ?? (reg ? cleanName(reg.name) : sym),
      decimals: isEth ? 18 : reg.decimals,
      kind: known?.kind ?? "crypto",
      correlates: known?.correlates ?? null,
      uiMultiplier: reg?.uiMultiplier ? Number(BigInt(reg.uiMultiplier)) / 1e18 : 1,
      color: known?.color ?? hashColor(sym),
      // GeckoTerminal's images for the Robinhood stock tokens are all the same
      // generic Robinhood mark — the brand-colored ticker monogram reads better.
      // Native ETH isn't a registry token (WETH's image is branded "WETH").
      logo: known?.kind === "stock" ? undefined : isEth ? ETH_LOGO : (reg?.logo ?? undefined),
    };
  };
  tokens.set("ETH", toInfo("ETH"));
  for (const sym of Object.keys(registry.tokens)) if (sym !== "WETH") tokens.set(sym, toInfo(sym));

  // pools keyed by unordered pair, deepest tier per pair. Registry pairs are
  // named "A/B" in whatever order the scanner probed them.
  type Pool = Registry["v4Pools"][number];
  const byPair = new Map<string, { a: TokenInfo; b: TokenInfo; pools: Pool[] }>();
  for (const p of registry.v4Pools) {
    const [x, y] = p.pair.split("/");
    if (x === "WETH" || y === "WETH") continue;
    const a = tokens.get(x);
    const b = tokens.get(y);
    if (!a || !b) continue;
    const key = [x, y].sort().join("/");
    const e = byPair.get(key) ?? { a, b, pools: [] };
    e.pools.push(p);
    byPair.set(key, e);
  }

  const makeMarket = (base: TokenInfo, quote: TokenInfo, pools: Pool[], quoteUsd: number): Market | null => {
    const [currency0, currency1] =
      base.address.toLowerCase() < quote.address.toLowerCase() ? [base.address, quote.address] : [quote.address, base.address];
    const baseIsCurrency0 = currency0.toLowerCase() === base.address.toLowerCase();
    const best = pools
      .filter(
        (p) =>
          // quote is currency1 exactly when base is currency0
          virtualQuoteUnits(p.liquidity, p.tick, baseIsCurrency0, quote.decimals) * quoteUsd >= MIN_VIRTUAL_QUOTE_USD,
      )
      .sort((p, q) => (BigInt(q.liquidity) > BigInt(p.liquidity) ? 1 : -1))[0];
    if (!best) return null;
    const quoteIsStable = quote.address.toLowerCase() === stable.toLowerCase();
    const kind: TokenKind =
      base.kind === "stock" || quote.kind === "stock" ? "stock" : base.kind === "stable" && quote.kind === "stable" ? "stable" : "crypto";
    return {
      slug: `${cfg.slug}/${base.symbol.toLowerCase()}-${quote.symbol.toLowerCase()}`,
      chainId,
      base,
      quote,
      quoteIsStable,
      quoteUsdSlug: quoteIsStable ? undefined : `${cfg.slug}/${quote.symbol.toLowerCase()}-${cfg.quote.symbol.toLowerCase()}`,
      pool: {
        poolId: best.poolId as `0x${string}`,
        currency0,
        currency1,
        fee: best.fee,
        tickSpacing: best.tickSpacing,
      },
      baseIsCurrency0,
      kind,
      lowIl: base.correlates !== null && base.correlates === quote.correlates,
      symbol: base.symbol,
      name: `${base.symbol} / ${quote.symbol}`,
      token: base.address,
      tokenDecimals: base.decimals,
      uiMultiplier: base.uiMultiplier,
      assetIsCurrency0: baseIsCurrency0,
      color: base.color,
    };
  };

  // pass 1: stablecoin-quoted pairs — they also give every token a USD price
  const usd = new Map<string, number>([[stable.toLowerCase(), 1]]);
  const stableMarkets: Market[] = [];
  const others: Array<{ base: TokenInfo; quote: TokenInfo; pools: Pool[] }> = [];
  for (const { a, b, pools } of byPair.values()) {
    const [quote, base] = quoteRank(a, stable) <= quoteRank(b, stable) ? [a, b] : [b, a];
    if (quote.address.toLowerCase() === stable.toLowerCase()) {
      const m = makeMarket(base, quote, pools, 1);
      if (!m) continue;
      stableMarkets.push(m);
      const tick = pools.find((p) => p.poolId === m.pool.poolId)!.tick;
      usd.set(base.address.toLowerCase(), tickToQuotePrice(tick, m.baseIsCurrency0, base.decimals, quote.decimals));
    } else {
      others.push({ base, quote, pools });
    }
  }
  // pass 2: everything else, priced through the quote leg's USD price
  const pairMarkets: Market[] = [];
  for (const { base, quote, pools } of others) {
    const quoteUsd = usd.get(quote.address.toLowerCase());
    if (!quoteUsd) continue; // no way to value it in dollars — don't list
    const m = makeMarket(base, quote, pools, quoteUsd);
    if (m) pairMarkets.push(m);
  }

  const bySym = (m: Market, n: Market) =>
    order(m.base.symbol) - order(n.base.symbol) ||
    m.base.symbol.localeCompare(n.base.symbol) ||
    order(m.quote.symbol) - order(n.quote.symbol);
  return [...stableMarkets.sort(bySym), ...pairMarkets.sort(bySym)];
}

export const MARKETS: Market[] = [
  ...buildMarkets(8453, baseRegistry as Registry),
  ...buildMarkets(4663, robinhoodRegistry as Registry),
];

if (!MARKETS.some((m) => m.slug === "base/eth-usdc")) {
  throw new Error("flagship ETH/USDC market on Base has no live pool in the registry");
}

const SLUG_INDEX = new Map(MARKETS.map((m) => [m.slug, m]));

/** Resolve a market from: "base/eth-usdc" (canonical), "base/eth" or "eth"
 *  (the token's stablecoin pair; bare symbols mean Base), the interim
 *  "eth-robinhood" form, or "eth-usdc" (Base). */
export function marketBySlug(key: string): Market | undefined {
  const k = key.toLowerCase().replace(/^\/+|\/+$/g, "");
  if (SLUG_INDEX.has(k)) return SLUG_INDEX.get(k);
  const legacy = k.match(/^([a-z0-9]+)-(base|robinhood)$/);
  let chainSlug: string;
  let rest: string;
  if (legacy) {
    chainSlug = legacy[2];
    rest = legacy[1];
  } else if (k.includes("/")) {
    [chainSlug, rest] = k.split("/", 2);
  } else {
    chainSlug = "base";
    rest = k;
  }
  const chain = Object.values(CHAINS).find((c) => c.slug === chainSlug);
  if (!chain) return undefined;
  if (rest.includes("-")) return SLUG_INDEX.get(`${chainSlug}/${rest}`);
  // bare token → its stablecoin pair
  return SLUG_INDEX.get(`${chainSlug}/${rest}-${chain.quote.symbol.toLowerCase()}`);
}
export const marketBySymbol = marketBySlug;

export const marketsOnChain = (chainId: number) => MARKETS.filter((m) => m.chainId === chainId);

/** The market that prices `market.quote` in the chain stablecoin (for
 *  two-leg zaps and USD valuation); undefined when quote is the stablecoin. */
export const quoteUsdMarket = (market: Market): Market | undefined =>
  market.quoteUsdSlug ? SLUG_INDEX.get(market.quoteUsdSlug) : undefined;

/** Per-share price for display: pool prices are per RAW unit. */
export const sharePrice = (market: Market, rawPrice: number) => rawPrice / market.base.uiMultiplier;
/** Share count for display from a raw (decimal-adjusted) amount. */
export const shareAmount = (market: Market, rawAmount: number) => rawAmount * market.base.uiMultiplier;
