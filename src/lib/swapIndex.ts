import { parseAbiItem } from "viem";
import { CHAINS, CHAIN_IDS, type ChainId } from "./chain";
import { ensureSchema, sql } from "./db";
import { marketsOnChain } from "./markets";
import { publicClientFor } from "./onchain";

/**
 * The swap index: every Uniswap v4 Swap in a listed pool, kept in Neon by
 * a cron so the activity engine (today's earnings, the trade feed), rung
 * notifications and the Targets keeper read one table instead of each
 * rescanning a day of logs through the RPC.
 *
 * One cursor per chain. Each run walks from the cursor to the chain head in
 * RPC-sized chunks, filtering on every listed pool id at once, and keeps
 * eight days of rows. A run that hits its time budget stops cleanly and the
 * next one picks up where it left; a reader that finds the cursor stale just
 * falls back to the RPC (see activity.ts).
 */

export const SWAP_EVENT = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);
export const BLOCKS_PER_DAY: Record<ChainId, bigint> = { 8453: 43_200n, 4663: 345_600n };
// Base's RPC (CDP) is slow on wide multi-pool log filters, so its chunks are
// small; Robinhood's (Alchemy) takes 40k blocks (~3 hours) in one call
const CHUNK: Record<ChainId, bigint> = { 8453: 4_000n, 4663: 40_000n };
const KEEP_DAYS = 8n;

export type IndexedSwap = {
  txHash: `0x${string}`;
  block: bigint;
  amount0: bigint;
  amount1: bigint;
  tick: number;
  liquidity: bigint;
};

export async function swapCursor(chainId: ChainId): Promise<bigint | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT head FROM swap_cursor WHERE chain_id = ${chainId}`) as Array<{ head: string }>;
  return rows[0] ? BigInt(rows[0].head) : null;
}

/** Rows for one pool from `fromBlock` (inclusive) up to the cursor, newest first. */
export async function readSwaps(chainId: ChainId, poolId: `0x${string}`, fromBlock: bigint): Promise<IndexedSwap[]> {
  await ensureSchema();
  const rows = (await sql()`
    SELECT tx_hash, block, amount0, amount1, tick, liquidity FROM swaps
    WHERE chain_id = ${chainId} AND pool_id = ${poolId.toLowerCase()} AND block >= ${fromBlock.toString()}
    ORDER BY block DESC, log_index DESC`) as Array<{ tx_hash: string; block: string; amount0: string; amount1: string; tick: number; liquidity: string }>;
  return rows.map((r) => ({
    txHash: r.tx_hash as `0x${string}`,
    block: BigInt(r.block),
    amount0: BigInt(r.amount0),
    amount1: BigInt(r.amount1),
    tick: Number(r.tick),
    liquidity: BigInt(r.liquidity),
  }));
}

export type IndexRun = { chainId: ChainId; from: bigint; to: bigint; inserted: number; done: boolean };

/** Advance one chain's cursor toward the head within `budgetMs`. */
export async function indexSwaps(chainId: ChainId, budgetMs = 20_000): Promise<IndexRun> {
  await ensureSchema();
  const q = sql();
  const client = publicClientFor(chainId);
  const pools = marketsOnChain(chainId).map((m) => m.pool.poolId.toLowerCase() as `0x${string}`);
  const head = await client.getBlockNumber();
  const cursor = await swapCursor(chainId);
  // first run: one day back, which is all the activity engine needs today
  const from = cursor !== null ? cursor + 1n : head - BLOCKS_PER_DAY[chainId];
  const start = Date.now();
  let inserted = 0;
  let at = from;
  const pm = CHAINS[chainId].uniswap.v4.poolManager;
  while (at <= head) {
    if (Date.now() - start > budgetMs) break;
    const to = at + CHUNK[chainId] - 1n < head ? at + CHUNK[chainId] - 1n : head;
    let logs: Awaited<ReturnType<typeof client.getLogs<typeof SWAP_EVENT>>> = [];
    if (pools.length) {
      try {
        logs = await client.getLogs({ address: pm, event: SWAP_EVENT, args: { id: pools }, fromBlock: at, toBlock: to });
      } catch (e) {
        // a slow RPC answer must not kill the run; the cursor stays where it is
        console.error(`swap index ${chainId} ${at}-${to}: ${(e as Error).message.split("\n")[0].slice(0, 120)}`);
        break;
      }
    }
    for (const l of logs) {
      const r = await q`INSERT INTO swaps (chain_id, pool_id, block, log_index, tx_hash, sender, amount0, amount1, sqrt_price, liquidity, tick, fee)
        VALUES (${chainId}, ${l.args.id!.toLowerCase()}, ${l.blockNumber.toString()}, ${l.logIndex}, ${l.transactionHash}, ${l.args.sender!.toLowerCase()},
                ${l.args.amount0!.toString()}, ${l.args.amount1!.toString()}, ${l.args.sqrtPriceX96!.toString()}, ${l.args.liquidity!.toString()}, ${l.args.tick!}, ${l.args.fee!})
        ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING RETURNING 1`;
      inserted += (r as unknown[]).length;
    }
    await q`INSERT INTO swap_cursor (chain_id, head) VALUES (${chainId}, ${to.toString()})
            ON CONFLICT (chain_id) DO UPDATE SET head = EXCLUDED.head, updated_at = now()`;
    at = to + 1n;
  }
  // keep eight days; older rows serve nothing we show
  const floor = head - BLOCKS_PER_DAY[chainId] * KEEP_DAYS;
  await q`DELETE FROM swaps WHERE chain_id = ${chainId} AND block < ${floor.toString()}`;
  return { chainId, from, to: at - 1n, inserted, done: at > head };
}

/** Run every chain, splitting the budget. */
export async function indexAllChains(budgetMs = 45_000): Promise<IndexRun[]> {
  const per = Math.floor(budgetMs / CHAIN_IDS.length);
  const out: IndexRun[] = [];
  for (const id of CHAIN_IDS) out.push(await indexSwaps(id, per));
  return out;
}
