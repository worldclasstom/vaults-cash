import { formatUnits, parseAbiItem } from "viem";
import { CHAINS, type ChainId } from "./chain";
import { getMarketPricing, publicClientFor } from "./onchain";
import { feeViewAbi, Q128, wrapSub, type OwnedPosition } from "./positions";

/**
 * What traders paid a position, and the trades that paid it — the daily
 * reason to open the app. Two sources, both straight from the chain:
 *
 *  - Exact totals: fee growth inside the position's range, read now and at
 *    a block N days ago (archive read), times the position's liquidity. This
 *    is the same arithmetic Uniswap uses to pay fees, so "today" is exact
 *    and unaffected by collects.
 *  - The feed: the pool's Swap events over the last 24h, each attributed to
 *    the position by its share of active liquidity while the swap's tick was
 *    inside the range. An estimate per trade, honest in aggregate.
 */

export type Trade = {
  txHash: `0x${string}`;
  block: string;
  /** unix seconds, estimated from block distance */
  ts: number;
  /** what the trader did to the base asset */
  side: "bought" | "sold";
  baseAmount: number;
  usd: number;
  /** what this position earned from it, in dollars (0 when out of range) */
  earnedUsd: number;
  inRange: boolean;
};

export type Activity = {
  todayUsd: number;
  weekUsd: number | null;
  tradesToday: number;
  tradesInRangeToday: number;
  /** the scan hit its time budget; counts are a floor */
  partial: boolean;
  recent: Trade[];
  asOf: number;
};

const BLOCKS_PER_DAY: Record<ChainId, bigint> = { 8453: 43_200n, 4663: 345_600n };
const BLOCK_SEC: Record<ChainId, number> = { 8453: 2, 4663: 0.25 };
const CHUNK: Record<ChainId, bigint> = { 8453: 50_000n, 4663: 40_000n };
const SWAP = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);

type SwapLog = { txHash: `0x${string}`; block: bigint; amount0: bigint; amount1: bigint; tick: number; liquidity: bigint };
type PoolScan = { at: number; head: bigint; logs: SwapLog[]; partial: boolean };
const scans = new Map<string, PoolScan>();
const mintBlocks = new Map<string, bigint | null>();
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

/** The block the position NFT was minted in (null = older than our lookback).
 *  A position that opened 3 hours ago must not be credited with 24 hours of
 *  the pool's fee growth. Cached forever: a mint block never changes. */
async function mintBlock(chainId: ChainId, tokenId: bigint, head: bigint): Promise<bigint | null> {
  const key = `${chainId}:${tokenId}`;
  if (mintBlocks.has(key)) return mintBlocks.get(key)!;
  const client = publicClientFor(chainId);
  const posm = CHAINS[chainId].uniswap.v4.positionManager;
  // only the last 8 days matter (older positions need no clamp); the RPCs
  // reject very wide ranges, so walk back in 100k-block chunks, newest first
  const floor = head - BLOCKS_PER_DAY[chainId] * 8n;
  const step = 100_000n;
  const start = Date.now();
  let found: bigint | null = null;
  for (let to = head; to > floor && found === null; to -= step) {
    if (Date.now() - start > 6_000) return null; // give up quietly; don't cache
    const from = to - step + 1n > floor ? to - step + 1n : floor;
    const logs = await client.getLogs({ address: posm, event: TRANSFER, args: { from: "0x0000000000000000000000000000000000000000", tokenId }, fromBlock: from, toBlock: to });
    if (logs.length) found = logs[0].blockNumber;
  }
  mintBlocks.set(key, found);
  return found;
}
const SCAN_TTL_MS = 30_000;
const SCAN_BUDGET_MS = 8_000;

/**
 * The pool's swaps over the last day, newest first. The first call pays for
 * a full day of logs; after that each refresh only fetches the blocks mined
 * since the last one (a few hundred on Base, a few thousand on Robinhood)
 * and prunes what fell out of the window, so steady-state cost is one small
 * getLogs per pool per refresh no matter how busy the pool is.
 */
async function poolSwaps(chainId: ChainId, poolId: `0x${string}`): Promise<PoolScan> {
  const key = `${chainId}:${poolId}`;
  const hit = scans.get(key);
  if (hit && Date.now() - hit.at < SCAN_TTL_MS) return hit;
  const client = publicClientFor(chainId);
  const head = await client.getBlockNumber();
  const floor = head - BLOCKS_PER_DAY[chainId];
  const pm = CHAINS[chainId].uniswap.v4.poolManager;
  const start = Date.now();
  const fetchRange = async (from: bigint, to: bigint): Promise<{ logs: SwapLog[]; partial: boolean }> => {
    const out: SwapLog[] = [];
    let partial = false;
    for (let hi = to; hi >= from; hi -= CHUNK[chainId]) {
      if (Date.now() - start > SCAN_BUDGET_MS) {
        partial = true;
        break;
      }
      const lo = hi - CHUNK[chainId] + 1n > from ? hi - CHUNK[chainId] + 1n : from;
      const raw = await client.getLogs({ address: pm, event: SWAP, args: { id: poolId }, fromBlock: lo, toBlock: hi });
      for (const l of raw) {
        out.push({ txHash: l.transactionHash, block: l.blockNumber, amount0: l.args.amount0!, amount1: l.args.amount1!, tick: l.args.tick!, liquidity: l.args.liquidity! });
      }
    }
    return { logs: out, partial };
  };

  let logs: SwapLog[];
  let partial: boolean;
  if (hit && !hit.partial && hit.head >= floor && hit.head < head) {
    // incremental: only the new blocks, then drop what's older than a day
    const delta = await fetchRange(hit.head + 1n, head);
    logs = [...delta.logs, ...hit.logs.filter((l) => l.block > floor)];
    partial = delta.partial;
  } else if (hit && hit.head === head) {
    logs = hit.logs;
    partial = hit.partial;
  } else {
    const full = await fetchRange(floor + 1n, head);
    logs = full.logs;
    partial = full.partial;
  }
  logs.sort((a, b) => (a.block > b.block ? -1 : a.block < b.block ? 1 : 0));
  const scan = { at: Date.now(), head, logs, partial };
  scans.set(key, scan);
  return scan;
}

export async function positionActivity(position: OwnedPosition): Promise<Activity> {
  const { market, tickLower, tickUpper, liquidity } = position;
  const chainId = market.chainId as ChainId;
  const client = publicClientFor(chainId);
  const stateView = CHAINS[chainId].uniswap.v4.stateView;
  const [scan, pricing] = await Promise.all([poolSwaps(chainId, market.pool.poolId), getMarketPricing(market)]);
  const head = scan.head;

  // dollars per raw unit of currency0 / currency1
  const c0IsBase = market.baseIsCurrency0;
  const usdPer = (isBase: boolean) => (isBase ? pricing.priceUsd / 10 ** market.base.decimals : pricing.quoteUsd / 10 ** market.quote.decimals);
  const usd0 = usdPer(c0IsBase);
  const usd1 = usdPer(!c0IsBase);

  const growth = (blockNumber?: bigint) =>
    client.readContract({ address: stateView, abi: feeViewAbi, functionName: "getFeeGrowthInside", args: [market.pool.poolId, tickLower, tickUpper], ...(blockNumber ? { blockNumber } : {}) });
  const earnedSince = (now: readonly [bigint, bigint], then: readonly [bigint, bigint]) => {
    const d0 = (liquidity * wrapSub(now[0], then[0])) / Q128;
    const d1 = (liquidity * wrapSub(now[1], then[1])) / Q128;
    return Number(d0) * usd0 + Number(d1) * usd1;
  };
  // never look back past the block the position was opened in
  const minted = await mintBlock(chainId, position.tokenId, head).catch(() => null);
  const since = (blocks: bigint) => {
    const b = head - blocks;
    return minted !== null && minted > b ? minted : b;
  };
  const [now, dayAgo, weekAgo] = await Promise.all([
    growth(),
    growth(since(BLOCKS_PER_DAY[chainId])).catch(() => null),
    growth(since(BLOCKS_PER_DAY[chainId] * 7n)).catch(() => null),
  ]);
  const todayUsd = dayAgo ? earnedSince(now, dayAgo) : 0;
  const weekUsd = weekAgo ? earnedSince(now, weekAgo) : null;
  // trades before the position existed didn't pay it
  const eligible = minted !== null ? scan.logs.filter((l) => l.block >= minted) : scan.logs;

  const lpFee = market.pool.fee / 1_000_000;
  const nowSec = Math.floor(Date.now() / 1000);
  const toTrade = (l: SwapLog): Trade => {
    const paid0 = l.amount0 < 0n; // the swapper paid currency0 and received currency1
    const amountIn = paid0 ? -l.amount0 : -l.amount1;
    const inUsd = Number(amountIn) * (paid0 ? usd0 : usd1);
    const baseIn = paid0 === c0IsBase; // did the trader pay with the base asset?
    const baseRaw = c0IsBase ? (paid0 ? -l.amount0 : l.amount0) : paid0 ? l.amount1 : -l.amount1;
    const inRange = l.tick >= tickLower && l.tick < tickUpper;
    const share = inRange && l.liquidity > 0n ? Number(liquidity) / Number(l.liquidity) : 0;
    return {
      txHash: l.txHash,
      block: l.block.toString(),
      ts: nowSec - Math.round(Number(head - l.block) * BLOCK_SEC[chainId]),
      side: baseIn ? "sold" : "bought",
      baseAmount: Math.abs(Number(baseRaw)) / 10 ** market.base.decimals,
      usd: inUsd,
      earnedUsd: inUsd * lpFee * share,
      inRange,
    };
  };
  const inRangeCount = eligible.reduce((n, l) => n + (l.tick >= tickLower && l.tick < tickUpper ? 1 : 0), 0);
  return {
    todayUsd,
    weekUsd,
    tradesToday: eligible.length,
    tradesInRangeToday: inRangeCount,
    partial: scan.partial,
    recent: eligible.slice(0, 12).map(toTrade),
    asOf: Math.floor(scan.at / 1000),
  };
}

export { formatUnits };
