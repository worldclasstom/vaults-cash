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

export type MarketKind = "crypto" | "stable" | "stock";

export type Market = {
  /** URL path under /market/: "base/eth", "robinhood/tsla". Symbols alone
   *  collide once the same asset trades on two chains. */
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
   *  divergence (near-zero impermanent loss); "crypto" = volatile crypto
   *  asset; "stock" = Robinhood-issued token tracking a US equity/ETF. */
  kind: MarketKind;
  /** the non-quote asset; address(0) = native ETH */
  token: `0x${string}`;
  tokenDecimals: number;
  /** ERC-8056 scaled-UI multiplier (1.0 = none). Pools trade RAW units, so
   *  all engine math stays raw; only displayed share counts and per-share
   *  prices apply it: shares = raw × m, price/share = rawPrice ÷ m. Moves
   *  with dividends/splits — regenerate the registry to refresh. */
  uiMultiplier: number;
  pool: PoolRef;
  /** address-sort order varies per pool: true when the asset is currency0
   *  (quote is currency1), false when the quote sorts first */
  assetIsCurrency0: boolean;
  color: string;
};

export const NATIVE_ETH = "0x0000000000000000000000000000000000000000" as const;

/** Dust floor for auto-listing, in virtual quote-side dollars: with
 *  liquidity L at sqrt-price √P the quote reserve of an equivalent full-range
 *  position is L·√P (quote = currency1) or L/√P (quote = currency0). Real
 *  concentrated pools hold less than that, so this is generous — e.g.
 *  SLV/USDG (L≈2e13) works out to ~$175 and can't even fill a $20 quote. The
 *  real "too thin to LP" gate is the GeckoTerminal TVL check in /api/stats. */
const MIN_VIRTUAL_QUOTE_USD = 1_000;

function virtualQuoteUsd(
  liquidity: string,
  tick: number,
  quoteIsCurrency1: boolean,
  quoteDecimals: number,
): number {
  const sqrtP = Math.pow(1.0001, tick / 2);
  const L = Number(liquidity);
  return (quoteIsCurrency1 ? L * sqrtP : L / sqrtP) / 10 ** quoteDecimals;
}

/** Shape shared by every registries/*.json written by verify-chain.ts. */
type Registry = {
  chainId: number;
  tokens: Record<string, { address: string; name: string; decimals: number; uiMultiplier?: string | null }>;
  v4Pools: Array<{ poolId: string; pair: string; fee: number; tickSpacing: number; tick: number; liquidity: string }>;
};

/** Presentation for tokens we know. Anything else in the registry with a
 *  live quote pool is still listed (MaxFi-style: every pool, not a curated
 *  seven) with the on-chain name, kind "crypto" and a hashed color. Order
 *  here is display order; unknown tokens follow. */
type Known = { name: string; kind: MarketKind; color: string };
const KNOWN: Record<string, Known> = {
  ETH: { name: "Ethereum", kind: "crypto", color: "#8a92b2" },
  cbBTC: { name: "Bitcoin", kind: "crypto", color: "#f7931a" },
  cbXRP: { name: "XRP", kind: "crypto", color: "#23292f" },
  cbETH: { name: "Coinbase Staked ETH", kind: "crypto", color: "#0052ff" },
  wstETH: { name: "Lido Staked ETH", kind: "crypto", color: "#00a3ff" },
  rETH: { name: "Rocket Pool ETH", kind: "crypto", color: "#f7a600" },
  weETH: { name: "EtherFi Staked ETH", kind: "crypto", color: "#6c4ff7" },
  AERO: { name: "Aerodrome", kind: "crypto", color: "#5b6ef5" },
  LINK: { name: "Chainlink", kind: "crypto", color: "#2a5ada" },
  AAVE: { name: "Aave", kind: "crypto", color: "#b6509e" },
  VIRTUAL: { name: "Virtuals", kind: "crypto", color: "#22c55e" },
  DEGEN: { name: "Degen", kind: "crypto", color: "#a36efd" },
  DAI: { name: "Dai", kind: "stable", color: "#f5ac37" },
  USDT: { name: "Tether", kind: "stable", color: "#26a17b" },
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
const KNOWN_ORDER = Object.keys(KNOWN);

function hashColor(sym: string): string {
  let h = 0;
  for (const ch of sym) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

/** Robinhood token names read "Tesla • Robinhood Token" on-chain — keep the
 *  part before the bullet for unknown tokens. */
const cleanName = (n: string) => n.split("•")[0].trim();

function buildMarkets(chainId: ChainId, registry: Registry): Market[] {
  const cfg = CHAINS[chainId];
  if (registry.chainId !== chainId) {
    throw new Error(`registry for chain ${chainId} was generated for chain ${registry.chainId}`);
  }
  const quoteSym = cfg.quote.symbol;

  const toAddress = (sym: string): `0x${string}` =>
    sym === "ETH" ? NATIVE_ETH : (registry.tokens[sym].address as `0x${string}`);

  /** The deepest (most-liquidity) quote pool for a token, or null if every
   *  tier is empty. Fee tiers migrate as liquidity moves — a hardcoded tier
   *  silently breaks when it drains, so always resolve the live deepest pool
   *  from the registry instead. Tokens with no live pool aren't listed. */
  const deepestQuotePool = (sym: string): PoolRef | null => {
    const names = [`${sym}/${quoteSym}`, `${quoteSym}/${sym}`];
    const a = toAddress(sym);
    const b = cfg.quote.address;
    const [currency0, currency1] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
    const quoteIsCurrency1 = currency1.toLowerCase() === b.toLowerCase();
    const best = registry.v4Pools
      .filter(
        (p) =>
          names.includes(p.pair) &&
          virtualQuoteUsd(p.liquidity, p.tick, quoteIsCurrency1, cfg.quote.decimals) >=
            MIN_VIRTUAL_QUOTE_USD,
      )
      .sort((a, b) => (BigInt(b.liquidity) > BigInt(a.liquidity) ? 1 : -1))[0];
    if (!best) return null;
    return {
      poolId: best.poolId as `0x${string}`,
      currency0,
      currency1,
      fee: best.fee,
      tickSpacing: best.tickSpacing,
    };
  };

  // native ETH first, then every registry token except the quote itself and
  // WETH (same asset as native ETH)
  const symbols = ["ETH", ...Object.keys(registry.tokens).filter((s) => s !== quoteSym && s !== "WETH")];
  symbols.sort((x, y) => {
    const ix = KNOWN_ORDER.indexOf(x);
    const iy = KNOWN_ORDER.indexOf(y);
    return (ix === -1 ? 1e9 : ix) - (iy === -1 ? 1e9 : iy) || x.localeCompare(y);
  });

  const out: Market[] = [];
  for (const symbol of symbols) {
    const pool = deepestQuotePool(symbol);
    if (!pool) continue; // no live liquidity in any tier — don't list it
    const token = toAddress(symbol);
    const reg = symbol === "ETH" ? undefined : registry.tokens[symbol];
    const known = KNOWN[symbol];
    const uiMultiplier = reg?.uiMultiplier ? Number(BigInt(reg.uiMultiplier)) / 1e18 : 1;
    out.push({
      slug: `${cfg.slug}/${symbol.toLowerCase()}`,
      symbol,
      name: known?.name ?? (reg ? cleanName(reg.name) : symbol),
      chainId,
      quote: cfg.quote,
      kind: known?.kind ?? "crypto",
      token,
      tokenDecimals: reg?.decimals ?? 18,
      uiMultiplier,
      pool,
      assetIsCurrency0: pool.currency0.toLowerCase() === token.toLowerCase(),
      color: known?.color ?? hashColor(symbol),
    });
  }
  return out;
}

export const MARKETS: Market[] = [
  ...buildMarkets(8453, baseRegistry as Registry),
  ...buildMarkets(4663, robinhoodRegistry as Registry),
];

if (!MARKETS.some((m) => m.slug === "base/eth")) {
  throw new Error("flagship ETH/USDC market on Base has no live pool in the registry");
}

/** Resolve a market from any of: "base/eth" (canonical slug), "eth" (bare
 *  symbol → the Base market, for old links and agent calls), or the interim
 *  "eth-robinhood" form. */
export function marketBySymbol(key: string): Market | undefined {
  const k = key.toLowerCase().replace(/^\/+|\/+$/g, "");
  const legacy = k.match(/^([a-z0-9]+)-(base|robinhood)$/);
  const slug = legacy ? `${legacy[2]}/${legacy[1]}` : k;
  return (
    MARKETS.find((m) => m.slug === slug) ??
    MARKETS.find((m) => m.chainId === 8453 && m.symbol.toLowerCase() === slug)
  );
}
export const marketBySlug = marketBySymbol;

export const marketsOnChain = (chainId: number) => MARKETS.filter((m) => m.chainId === chainId);

/** Per-share price for display: pool prices are per RAW unit. */
export const sharePrice = (market: Market, rawPrice: number) => rawPrice / market.uiMultiplier;
/** Share count for display from a raw (decimal-adjusted) amount. */
export const shareAmount = (market: Market, rawAmount: number) => rawAmount * market.uiMultiplier;
